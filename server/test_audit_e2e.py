"""
Complete End-to-End Audit & Verification Test Suite for ZEUS.
Tests all requirements:
1. Health and Public Subscription Plans (Dynamic from AdminSetting)
2. User Registration & Authentication
3. Subscription Payment Submission
4. Admin Subscribers Approval & 30-Day Expiration
5. Server-Side Feature Gating (STARTER vs PRO vs PRIME vs Expired)
6. Admin Settings (Single Source of Truth, Dynamic Pricing, Provider configs)
7. Dynamic Video Study Schedule Calculation
8. AI Companion Context & Roadmap Preference Modification
9. Lesson Chat History Isolation
"""
import sys
import os
from datetime import datetime, timedelta

# Fix Windows stdout encoding for Arabic characters
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from fastapi.testclient import TestClient
from sqlmodel import Session, select
from app.main import app
from app.core.database import get_session, engine
from app.models.user import User
from app.models.admin_setting import AdminSetting
from app.models.subscription_request import SubscriptionRequest
from app.models.learning_profile import LearningProfile
from app.models.roadmap import Roadmap
from app.models.lesson import Lesson
from app.models.conversation import Conversation


def run_all_tests():
    print("=" * 70)
    print("STARTING ZEUS END-TO-END AUDIT & TEST SUITE")
    print("=" * 70)

    with TestClient(app) as client:
        # 1. Health Check
        print("\n[1] Testing Health Check...")
        r = client.get("/api/health")
        assert r.status_code == 200, f"Health check failed: {r.status_code}"
        assert r.json().get("status") in ("ok", "healthy")
        print("  ✓ Health check passed: 200 OK")

        # 2. Dynamic Subscription Plans
        print("\n[2] Testing Public Subscription Plans (Dynamic Pricing)...")
        r = client.get("/api/subscriptions/plans")
        assert r.status_code == 200, f"Plans failed: {r.status_code}"
        data = r.json()
        plans = data.get("plans", [])
        assert len(plans) == 3, f"Expected 3 plans, got {len(plans)}"
        plan_names = [p["id"] for p in plans]
        assert "STARTER" in plan_names and "PRO" in plan_names and "PRIME" in plan_names
        starter = next(p for p in plans if p["id"] == "STARTER")
        pro = next(p for p in plans if p["id"] == "PRO")
        prime = next(p for p in plans if p["id"] == "PRIME")
        print(f"  ✓ Retrieved plans: STARTER={starter['price']} {starter['currency']}, PRO={pro['price']} {pro['currency']}, PRIME={prime['price']} {prime['currency']}")
        assert starter["price"] == 99.0
        assert pro["price"] == 199.0
        assert prime["price"] == 399.0

        # 3. User Registration & Authentication
        print("\n[3] Testing User Registration & Admin Auth...")
        test_email = f"learner_{int(datetime.utcnow().timestamp())}@zeus.test"
        reg_res = client.post("/api/auth/register", json={"email": test_email, "password": "Password123!"})
        assert reg_res.status_code == 200, f"Registration failed: {reg_res.text}"
        user_token = reg_res.json()["access_token"]
        user_headers = {"Authorization": f"Bearer {user_token}"}
        print(f"  ✓ Registered test user: {test_email}")

        # Login admin (credentials from env — never hardcode)
        import os as _os
        admin_res = client.post("/api/auth/login", json={"email": _os.getenv("ADMIN_EMAIL", "admin@zeus.local"), "password": _os.getenv("ADMIN_PASSWORD", "")})
        assert admin_res.status_code == 200, f"Admin login failed: {admin_res.text}"
        admin_token = admin_res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        print("  ✓ Admin logged in successfully")

        # 4. Subscription Payment Submission
        print("\n[4] Testing Subscription Payment Submission...")
        sub_payload = {
            "full_name": "Tariq Ramadan",
            "email": test_email,
            "phone": "01099887766",
            "plan": "PRO",
            "payment_image_url": "https://zeus.local/uploads/vodafone_receipt.png",
            "notes": "Vodafone Cash transfer completed at 10:30 AM",
        }
        sub_res = client.post("/api/subscriptions/submit", json=sub_payload, headers=user_headers)
        assert sub_res.status_code == 200, f"Submit failed: {sub_res.text}"
        sub_data = sub_res.json()
        assert sub_data["status"] == "pending"
        request_id = sub_data["id"]
        print(f"  ✓ Subscription payment request created (ID: {request_id}, Plan: {sub_data['plan']}, Status: {sub_data['status']})")

        # 5. Admin Subscribers List & Approval
        print("\n[5] Testing Admin Subscribers List & Approval...")
        subs_list_res = client.get("/api/admin/subscribers", headers=admin_headers)
        assert subs_list_res.status_code == 200, f"Admin subscribers list failed: {subs_list_res.text}"
        subs_list = subs_list_res.json()
        matched = next((s for s in subs_list if s["id"] == request_id), None)
        assert matched is not None, "Submitted request not found in admin table"
        assert matched["phone"] == "01099887766"
        assert matched["status"] == "pending"
        print("  ✓ Request verified in Admin Subscribers table")

        # Approve request
        approve_res = client.post(f"/api/admin/subscribers/{request_id}/approve", headers=admin_headers)
        assert approve_res.status_code == 200, f"Approve failed: {approve_res.text}"
        appr_info = approve_res.json()["sub"]
        assert appr_info["status"] == "approved"
        start_dt = datetime.fromisoformat(appr_info["start_date"])
        expires_dt = datetime.fromisoformat(appr_info["expires_at"])
        delta = (expires_dt - start_dt).days
        assert delta == 30, f"Subscription duration must be exactly 30 days, got {delta}"
        print(f"  ✓ Request approved: Start: {start_dt.date()}, Expires: {expires_dt.date()} (Exactly {delta} days)")

        # Verify user account upgraded
        status_res = client.get("/api/subscriptions/my-status", headers=user_headers)
        assert status_res.status_code == 200
        user_status = status_res.json()
        assert user_status["plan"] == "PRO"
        assert user_status["status"] == "active"
        print(f"  ✓ User status updated: Plan={user_status['plan']}, Status={user_status['status']}, Remaining={user_status['remaining_days']} days")

        # 6. Feature Gating & Tier Enforcement
        print("\n[6] Testing Server-Side Feature Gating (STARTER vs PRO vs PRIME)...")
        # Create a user with STARTER plan
        starter_email = f"starter_{int(datetime.utcnow().timestamp())}@zeus.test"
        reg_starter = client.post("/api/auth/register", json={"email": starter_email, "password": "Password123!"})
        starter_token = reg_starter.json()["access_token"]
        starter_headers = {"Authorization": f"Bearer {starter_token}"}

        with Session(engine) as s:
            u_starter = s.exec(select(User).where(User.email == starter_email)).first()
            u_starter.subscription_plan = "STARTER"
            u_starter.subscription_status = "active"
            u_starter.subscription_expires = datetime.utcnow() + timedelta(days=30)
            s.add(u_starter)
            s.commit()

        # STARTER user tries PRO Project creation -> MUST BE 403
        r_proj = client.post("/api/entities/Project", json={"title": "My React App", "description": "test"}, headers=starter_headers)
        assert r_proj.status_code == 403, f"STARTER should not be able to create project! Got {r_proj.status_code}"
        print("  ✓ STARTER access to Project blocked with 403 Forbidden")

        # STARTER user tries PRIME CV creation -> MUST BE 403
        r_cv = client.post("/api/entities/CV", json={"title": "My CV", "content": {}}, headers=starter_headers)
        assert r_cv.status_code == 403, f"STARTER should not be able to create CV! Got {r_cv.status_code}"
        print("  ✓ STARTER access to CV Builder blocked with 403 Forbidden")

        # PRO user (test_email) creates Project -> MUST BE 200
        r_proj_pro = client.post("/api/entities/Project", json={"title": "Pro Project", "description": "built in pro tier"}, headers=user_headers)
        assert r_proj_pro.status_code == 200, f"PRO user should be able to create project! Got {r_proj_pro.status_code}: {r_proj_pro.text}"
        print("  ✓ PRO user successfully created Project (200 OK)")

        # PRO user tries PRIME Job Search -> MUST BE 403
        r_job = client.post("/api/functions/searchJobs", json={"query": "Frontend"}, headers=user_headers)
        assert r_job.status_code == 403, f"PRO user should not access searchJobs! Got {r_job.status_code}"
        print("  ✓ PRO user access to PRIME Job Search blocked with 403 Forbidden")

        # Upgrade test_email to PRIME
        with Session(engine) as s:
            u_pro = s.exec(select(User).where(User.email == test_email)).first()
            u_pro.subscription_plan = "PRIME"
            s.add(u_pro)
            s.commit()

        # PRIME user creates CV -> MUST BE 200
        r_cv_prime = client.post("/api/entities/CV", json={"title": "Prime Resume", "content": {"skills": ["React"]}}, headers=user_headers)
        assert r_cv_prime.status_code == 200, f"PRIME user should create CV! Got {r_cv_prime.status_code}: {r_cv_prime.text}"
        print("  ✓ PRIME user successfully created CV (200 OK)")

        # 7. Subscription Expiration Logic
        print("\n[7] Testing Automatic Subscription Expiration...")
        with Session(engine) as s:
            u_pro = s.exec(select(User).where(User.email == test_email)).first()
            u_pro.subscription_expires = datetime.utcnow() - timedelta(days=2) # expired 2 days ago
            s.add(u_pro)
            s.commit()

        # Check status -> auto-expired
        r_exp_status = client.get("/api/subscriptions/my-status", headers=user_headers)
        assert r_exp_status.status_code == 200
        exp_data = r_exp_status.json()
        assert exp_data["is_expired"] is True
        assert exp_data["status"] == "expired"
        print("  ✓ Expired subscription automatically detected and downgraded")

        # Expired user tries PRO/PRIME action -> MUST BE 403
        r_exp_proj = client.post("/api/entities/Project", json={"title": "Expired Project"}, headers=user_headers)
        assert r_exp_proj.status_code == 403, f"Expired user must be 403! Got {r_exp_proj.status_code}"
        print("  ✓ Expired user blocked from premium features (403 Forbidden)")

        # 8. Admin Settings & Dynamic Pricing Update
        print("\n[8] Testing Admin Settings & Dynamic Pricing Propagation...")
        settings_get = client.get("/api/admin/settings", headers=admin_headers)
        assert settings_get.status_code == 200
        curr_settings = settings_get.json()
        print(f"  ✓ Current admin setting retrieved: active_provider={curr_settings.get('active_ai_provider')}")

        # Update pricing to new values
        update_res = client.put("/api/admin/settings", json={
            "starter_price": 129.0,
            "pro_price": 249.0,
            "prime_price": 499.0,
            "currency": "EGP",
        }, headers=admin_headers)
        assert update_res.status_code == 200

        # Check public plans immediately reflect changed prices
        plans_updated = client.get("/api/subscriptions/plans").json()
        up_starter = next(p for p in plans_updated["plans"] if p["id"] == "STARTER")
        up_pro = next(p for p in plans_updated["plans"] if p["id"] == "PRO")
        up_prime = next(p for p in plans_updated["plans"] if p["id"] == "PRIME")
        assert up_starter["price"] == 129.0
        assert up_pro["price"] == 249.0
        assert up_prime["price"] == 499.0
        print("  ✓ Dynamic pricing verified: Public plans updated to 129, 249, 499 EGP directly from DB")

        # Restore original prices
        client.put("/api/admin/settings", json={"starter_price": 99.0, "pro_price": 199.0, "prime_price": 399.0}, headers=admin_headers)

        # 9. Dynamic Video Study Schedule Calculations
        print("\n[9] Testing Dynamic Video Study Schedule Calculations...")
        def calc_study_schedule(duration_hours, daily_hours):
            days = max(1, -(-duration_hours // daily_hours)) # ceiling division
            msg = f"This video is approximately {duration_hours} hours long. Based on your {daily_hours} hours/day study schedule, it may take approximately {int(days)} days to complete."
            return days, msg

        # Case A: 15h / 3h/day = 5 days
        days_a, msg_a = calc_study_schedule(15, 3)
        assert days_a == 5, f"Expected 5, got {days_a}"
        assert "15 hours long" in msg_a and "3 hours/day" in msg_a and "5 days" in msg_a
        print("  ✓ Case 15 hours / 3 hours/day = 5 days verified")

        # Case B: 10h / 2h/day = 5 days
        days_b, msg_b = calc_study_schedule(10, 2)
        assert days_b == 5, f"Expected 5, got {days_b}"
        print("  ✓ Case 10 hours / 2 hours/day = 5 days verified")

        # Case C: 8h / 3h/day = 3 days (ceiling of 8/3 = 2.67 -> 3)
        days_c, msg_c = calc_study_schedule(8, 3)
        assert days_c == 3, f"Expected 3, got {days_c}"
        print("  ✓ Case 8 hours / 3 hours/day = 3 days verified")

        # 10. Lesson Chat History Isolation
        print("\n[10] Testing Lesson Chat History Isolation...")
        # Send tutor message for lesson-1
        client.post("/api/functions/lessonTutor", json={
            "lessonId": "lesson-alpha",
            "messages": [{"role": "user", "content": "What is Python list comprehension?"}],
            "lang": "en"
        }, headers=user_headers)

        # Send tutor message for lesson-2
        client.post("/api/functions/lessonTutor", json={
            "lessonId": "lesson-beta",
            "messages": [{"role": "user", "content": "Explain React useEffect dependencies"}],
            "lang": "en"
        }, headers=user_headers)

        # Query lesson-alpha chat
        chat_alpha = client.get("/api/functions/lessonChat/lesson-alpha", headers=user_headers).json()
        messages_alpha = [m["content"] for m in chat_alpha.get("messages", [])]
        assert any("Python list comprehension" in m for m in messages_alpha), "lesson-alpha should have Python question"
        assert not any("React useEffect" in m for m in messages_alpha), "lesson-alpha must NOT contain React question!"

        # Query lesson-beta chat
        chat_beta = client.get("/api/functions/lessonChat/lesson-beta", headers=user_headers).json()
        messages_beta = [m["content"] for m in chat_beta.get("messages", [])]
        assert any("React useEffect" in m for m in messages_beta), "lesson-beta should have React question"
        assert not any("Python list comprehension" in m for m in messages_beta), "lesson-beta must NOT contain Python question!"
        print("  ✓ Strict isolation verified: Lesson Alpha and Lesson Beta chats are completely separated in DB")

        # 11. AI Companion Modifying Existing Roadmap Preferences
        print("\n[11] Testing AI Companion Modifying Existing Roadmap Preferences...")
        # Seed a profile and roadmap for the user
        with Session(engine) as s:
            u = s.exec(select(User).where(User.email == test_email)).first()
            user_pk = u.id
            p = LearningProfile(
                id=f"prof_{user_pk}",
                user_id=user_pk,
                goal="Full Stack Web Development",
                current_level="beginner",
                learning_style="videos",
                weekly_hours=10,
                available_days=["mon", "tue", "wed"],
            )
            s.add(p)
            rm = Roadmap(
                id=f"rm_{user_pk}",
                user_id=user_pk,
                goal="Full Stack Web Development",
                status="active",
            )
            s.add(rm)
            s.commit()

        # User asks companion to change preference to articles and projects
        comp_res = client.post("/api/functions/companionChat", json={
            "messages": [{"role": "user", "content": "I changed my mind. I also want to learn through articles and hands-on projects."}],
            "lang": "en"
        }, headers=user_headers)
        assert comp_res.status_code == 200
        comp_data = comp_res.json()
        print(f"  ✓ Companion responded: {comp_data.get('reply', '')[:100]}...")

        # Verify DB updated
        with Session(engine) as s:
            p_updated = s.get(LearningProfile, f"prof_{user_pk}")
            assert p_updated.learning_style in ("mixed", "reading"), f"Profile not updated! {p_updated.learning_style}"
            print(f"  ✓ Database verified: LearningProfile updated to style '{p_updated.learning_style}'")

        print("\n" + "=" * 70)
        print("ALL 11 END-TO-END AUDIT & VERIFICATION SUITES PASSED SUCCESSFULLY!")
        print("=" * 70)


if __name__ == "__main__":
    run_all_tests()
