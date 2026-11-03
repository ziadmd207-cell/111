import asyncio
import unittest

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import Lesson, Roadmap
from app.routers import functions
from app.routers.functions import (
    DATA_ANALYST_COVERAGE,
    FULL_STACK_COVERAGE,
    _missing_market_skill_lessons,
    _market_skills_to_teach,
    _normalize_roadmap_nodes,
    _topics_without_dedicated_lessons,
    _validate_roadmap_nodes,
)


class RoadmapStructureTests(unittest.TestCase):
    def make_node(self, phase, phase_kind, hours=4, suffix=""):
        objective = f"Learn skill {phase}"
        skills = [f"Skill {phase}", f"Practice {phase}"]
        tools = []
        if phase_kind == "thinking_methods":
            objective = "Practice problem-solving by decomposing tasks, testing assumptions, and debugging."
            skills = ["Problem decomposition", "Debugging"]
        if phase_kind == "workflow_tools":
            objective = "Use an AI assistant to speed up a domain workflow and verify its output."
            skills = ["AI-assisted workflow", "Output verification"]
            tools = ["ChatGPT AI assistant"]
        return {
            "id": f"lesson-{phase}{suffix}",
            "title": f"Lesson {phase}",
            "phase": phase,
            "phase_kind": phase_kind,
            "phase_title": f"Phase {phase}",
            "phase_objective": f"Objective for phase {phase}",
            "objective": objective,
            "skills": skills,
            "tools": tools,
            "estimated_hours": hours,
            "tasks": ["Read", "Practice", "Review"],
            "projects": [f"Project {phase}"],
            "resources": [],
            "parent_ids": [],
        }

    def make_topic_node(self, phase, phase_kind, title, objective=None, skills=None):
        node = self.make_node(phase, phase_kind, suffix=f"-{title.lower().replace(' ', '-')}")
        node["title"] = title
        node["objective"] = objective or title
        node["skills"] = skills or [title, f"Practice: {title}"]
        return node

    def thinking_lessons(self, phase):
        return [
            self.make_topic_node(phase, "thinking_methods", "Problem decomposition", "Break down a realistic field problem into smaller tasks."),
            self.make_topic_node(phase, "thinking_methods", "Choosing an approach and trade-offs", "Compare approaches and justify a method using evidence and trade-offs."),
            self.make_topic_node(phase, "thinking_methods", "Testing assumptions and debugging", "Test assumptions, debug the workflow, and validate the result."),
            self.make_topic_node(phase, "thinking_methods", "Communicating findings and decisions", "Explain the decisions and communicate findings to others."),
        ]

    def business_lessons(self, phase, include_saas=False):
        lessons = [
            self.make_topic_node(phase, "business_ideation", "Industry landscape, roles, and vocabulary", "Learn the field's industry landscape, common roles, and professional vocabulary."),
            self.make_topic_node(phase, "business_ideation", "Real workflows, teams, and stakeholders", "Map real-world workflows, cross-functional teams, and stakeholders in the field."),
            self.make_topic_node(phase, "business_ideation", "How the field creates business value", "Understand how the field creates value in real organizations."),
            self.make_topic_node(phase, "business_ideation", "Finding users and meaningful problems", "Conduct user research into customer needs, pain points, and field opportunities."),
            self.make_topic_node(phase, "business_ideation", "Business models and service pricing", "Compare relevant business models, services, and pricing."),
            self.make_topic_node(phase, "business_ideation", "Validating demand, costs, and risks", "Validate demand and assess costs, competition, privacy, and risks."),
        ]
        if include_saas:
            lessons.extend([
                self.make_topic_node(phase, "business_ideation", "SaaS problem discovery and demand validation", "Validate demand for a specific SaaS problem."),
                self.make_topic_node(phase, "business_ideation", "SaaS MVP scope and subscription pricing", "Scope a SaaS MVP and compare recurring pricing models."),
                self.make_topic_node(phase, "business_ideation", "SaaS operating costs and ongoing risks", "Estimate SaaS operating costs and assess ongoing risks."),
            ])
        return lessons

    def career_lessons(self, phase):
        return [
            self.make_topic_node(phase, "career_launch", "LinkedIn profile and networking", "Improve a field-specific LinkedIn profile and networking approach."),
            self.make_topic_node(phase, "career_launch", "Khamsat and Mostaql service profiles", "Create and position field-specific service profiles on Khamsat and Mostaql."),
            self.make_topic_node(phase, "career_launch", "Fiverr, Upwork, and PeoplePerHour proposals", "Build profiles and proposals for Fiverr, Upwork, and PeoplePerHour."),
            self.make_topic_node(phase, "career_launch", "Client proposals, pricing, and safe communication", "Write a client proposal, set pricing and scope, and practice scam awareness."),
        ]

    def test_dynamic_phases_allow_multiple_focused_lessons_and_assign_weekly_schedule(self):
        nodes = [
            self.make_node(10, "orientation"),
            self.make_node(20, "foundations"),
            self.make_node(30, "core"),
            *self.thinking_lessons(40),
            self.make_node(50, "workflow_tools"),
            *self.business_lessons(60),
            *self.career_lessons(70),
        ]

        normalized = _normalize_roadmap_nodes(nodes, weekly_hours=8)

        self.assertEqual([node["phase"] for node in normalized], [1, 2, 3, 4, 4, 4, 4, 5, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7])
        self.assertEqual([node["week"] for node in normalized], [
            1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9,
        ])
        self.assertEqual(_validate_roadmap_nodes(normalized, {"current_level": "beginner"}), [])

    def test_beginner_roadmap_requires_foundations(self):
        nodes = [
            self.make_node(1, "orientation"),
            self.make_node(2, "core"),
            *self.thinking_lessons(3),
            self.make_node(4, "workflow_tools"),
            *self.business_lessons(5),
            *self.career_lessons(6),
        ]
        normalized = _normalize_roadmap_nodes(nodes)

        self.assertTrue(any(
            "foundations" in issue
            for issue in _validate_roadmap_nodes(normalized, {"current_level": "beginner"})
        ))

    def test_professional_roadmap_validation_does_not_enforce_a_fixed_lesson_total(self):
        nodes = [
            self.make_node(1, "orientation"),
            self.make_node(2, "core"),
            *self.thinking_lessons(3),
            self.make_node(4, "workflow_tools"),
            *self.business_lessons(5),
            *self.career_lessons(6),
        ]
        normalized = _normalize_roadmap_nodes(nodes)
        self.assertEqual(_validate_roadmap_nodes(
            normalized,
            {"current_level": "advanced", "video_length_preference": "short"},
            "Professional career path",
        ), [])

    def test_data_analyst_tools_phase_requires_a_bi_tool_and_ai_assistant(self):
        nodes = [
            self.make_node(1, "orientation"),
            self.make_node(2, "foundations"),
            *[
                self.make_topic_node(3, "core", title)
                for title in (
                    "Excel formulas and references",
                    "Excel sorting, filtering, and structured tables",
                    "Excel lookup and conditional formulas",
                    "Spreadsheet data cleaning",
                    "Pivot tables and spreadsheet summaries",
                    "Spreadsheet charts and formatting",
                    "Practical statistics",
                    "Data cleaning and quality",
                    "SQL filtering and aggregation",
                    "SQL joins and relational data",
                    "SQL subqueries, CTEs, and window functions",
                    "Python foundations for analysis",
                    "pandas data manipulation",
                    "NumPy numerical analysis",
                    "Python data visualization libraries: Matplotlib and Seaborn",
                    "Power Query data preparation",
                    "Power BI data modeling and DAX",
                    "Power BI reports and dashboards",
                    "Tableau data connections and preparation",
                    "Tableau calculations and dashboards",
                    "Data modeling and KPI definition",
                    "Business questions and analytical interpretation",
                    "Data storytelling and recommendations",
                )
            ],
            *self.thinking_lessons(4),
            self.make_node(5, "workflow_tools"),
            *self.business_lessons(6),
            *self.career_lessons(7),
        ]
        workflow_node = next(node for node in nodes if node["phase_kind"] == "workflow_tools")
        workflow_node["tools"] = ["Looker Studio", "ChatGPT AI assistant"]
        normalized = _normalize_roadmap_nodes(nodes)
        profile = {"current_level": "beginner", "video_length_preference": "long"}
        self.assertEqual(_validate_roadmap_nodes(normalized, profile, "Data Analyst"), [])

        normalized_workflow_node = next(
            node for node in normalized if node["phase_kind"] == "workflow_tools"
        )
        normalized_workflow_node["tools"] = ["ChatGPT AI assistant"]
        self.assertTrue(any(
            "BI/dashboard tool" in issue
            for issue in _validate_roadmap_nodes(normalized, profile, "Data Analyst")
        ))

    def test_data_analyst_requires_distinct_lessons_for_both_bi_tools_and_python_stack(self):
        complete_lessons = [
            {"title": title}
            for title in (
                "Power Query data preparation",
                "Power BI data modeling and DAX",
                "Power BI reports and dashboards",
                "Tableau data connections and preparation",
                "Tableau calculations and dashboards",
                "Python foundations for analysis",
                "pandas data manipulation",
                "NumPy numerical analysis",
                "Python data visualization with Matplotlib and Seaborn",
            )
        ]
        self.assertEqual(
            _topics_without_dedicated_lessons(complete_lessons, {
                topic: DATA_ANALYST_COVERAGE[topic]
                for topic in (
                    "Power Query data preparation",
                    "Power BI data modeling and DAX",
                    "Power BI reports and dashboards",
                    "Tableau data connections and preparation",
                    "Tableau calculations and dashboards",
                    "Python foundations for analysis",
                    "pandas data manipulation",
                    "NumPy numerical analysis",
                    "Python data visualization libraries",
                )
            }),
            [],
        )
        collapsed = [{"title": "Python, pandas, NumPy, Power BI, and Tableau essentials"}]
        self.assertEqual(
            len(_topics_without_dedicated_lessons(collapsed, {
                topic: DATA_ANALYST_COVERAGE[topic]
                for topic in (
                    "Power Query data preparation",
                    "Power BI data modeling and DAX",
                    "Power BI reports and dashboards",
                    "Tableau data connections and preparation",
                    "Tableau calculations and dashboards",
                    "Python foundations for analysis",
                    "pandas data manipulation",
                    "NumPy numerical analysis",
                    "Python data visualization libraries",
                )
            })),
            8,
        )

    def test_concept_granularity_uses_distinct_lessons_without_targeting_a_count(self):
        coverage = {
            "HTML structure": ("html structure",),
            "HTML forms": ("html forms",),
            "HTML accessibility": ("html accessibility",),
        }
        short_path = [
            {"title": "HTML structure and semantics"},
            {"title": "HTML forms and validation"},
            {"title": "HTML accessibility basics"},
        ]
        self.assertEqual(_topics_without_dedicated_lessons(short_path, coverage), [])
        collapsed_path = [{"title": "HTML structure, forms, and accessibility"}]
        self.assertEqual(
            _topics_without_dedicated_lessons(collapsed_path, coverage),
            ["HTML forms", "HTML accessibility"],
        )

    def test_full_stack_html_react_and_database_concepts_need_separate_lessons(self):
        required_topics = (
            "HTML structure and semantics",
            "HTML forms",
            "HTML accessibility",
            "Frontend framework components and props",
            "Frontend framework state and hooks",
            "Frontend routing",
            "database schema",
            "database relationships",
            "database queries",
            "database joins",
            "backend language and framework",
            "backend programming language fundamentals",
            "backend framework setup and project structure",
            "backend routes and controllers",
            "backend input validation and authentication",
            "backend database access and migrations",
            "REST APIs and error handling",
            "backend security and secrets",
            "database indexes and transactions",
            "Git and GitHub collaboration",
            "HTTP and browser-to-server communication",
            "testing and debugging",
            "deployment and environment configuration",
            "CI/CD and production monitoring",
        )
        coverage = {topic: FULL_STACK_COVERAGE[topic] for topic in required_topics}
        lessons = [
            {"title": "HTML document structure"},
            {"title": "HTML forms and validation"},
            {"title": "HTML accessibility"},
            {"title": "React components and props"},
            {"title": "React state and hooks"},
            {"title": "React routing"},
            {"title": "Database schema design"},
            {"title": "Database relationships and foreign keys"},
            {"title": "SQL database queries"},
            {"title": "SQL joins across tables"},
            {"title": "PHP and Laravel backend language/framework overview"},
            {"title": "PHP syntax, arrays, and Composer"},
            {"title": "Laravel project structure and configuration"},
            {"title": "Laravel routes and controllers"},
            {"title": "Laravel request validation and authentication"},
            {"title": "Eloquent ORM and Laravel database migrations"},
            {"title": "REST API errors and HTTP status codes"},
            {"title": "Secure password hashing, secrets, and SQL injection prevention"},
            {"title": "Database indexes and transactions"},
            {"title": "Git and GitHub branches and commits"},
            {"title": "HTTP requests and responses between browser and server"},
            {"title": "Unit and integration testing with debugging"},
            {"title": "Production deployment and environment configuration"},
            {"title": "CI/CD deployment pipeline and production monitoring"},
        ]
        self.assertEqual(_topics_without_dedicated_lessons(lessons, coverage), [])
        collapsed_lessons = [
            {"title": "HTML document structure, forms, and accessibility"},
            {"title": "React components, state, hooks, and routing"},
            {"title": "Database schema, relationships, queries, and joins"},
        ]
        self.assertGreaterEqual(len(_topics_without_dedicated_lessons(collapsed_lessons, coverage)), 11)

    def test_researched_job_skills_each_need_a_dedicated_lesson(self):
        required_skills = ["PHP", "Laravel", "SQL"]
        bundled = [{"title": "PHP, Laravel, and SQL backend essentials"}]
        self.assertEqual(len(_missing_market_skill_lessons(bundled, required_skills)), 2)

        focused = [
            {"title": "PHP language fundamentals", "objective": "Write PHP functions and arrays."},
            {"title": "Laravel framework routing", "objective": "Build routes in Laravel."},
            {"title": "SQL queries", "objective": "Write SQL queries."},
        ]
        self.assertEqual(_missing_market_skill_lessons(focused, required_skills), [])
        self.assertEqual(
            _market_skills_to_teach({
                "required_skills": ["SQL", "Python"],
                "prerequisites": ["Statistics", "SQL"],
            }),
            ["SQL", "Python", "Statistics"],
        )

    def test_product_building_paths_require_business_ideation_before_career_launch(self):
        nodes = [
            self.make_node(1, "orientation"),
            self.make_node(2, "foundations"),
            self.make_node(3, "core"),
            *self.thinking_lessons(4),
            self.make_node(5, "workflow_tools"),
            *self.business_lessons(6, include_saas=True),
            *self.career_lessons(7),
        ]
        normalized = _normalize_roadmap_nodes(nodes)
        self.assertEqual(
            _validate_roadmap_nodes(
                normalized,
                {"current_level": "beginner"},
                "Full Stack Developer",
            ),
            [],
        )
        without_field_context = [
            node for node in normalized
            if node["title"] not in {
                "Industry landscape, roles, and vocabulary",
                "Real workflows, teams, and stakeholders",
            }
        ]
        field_context_issues = _validate_roadmap_nodes(
            _normalize_roadmap_nodes(without_field_context),
            {"current_level": "beginner"},
            "Full Stack Developer",
        )
        self.assertTrue(any(
            "industry landscape, roles, and vocabulary" in issue
            and "real workflows, teams, and stakeholders" in issue
            for issue in field_context_issues
        ))
        without_business_stage = [
            node for node in normalized if node["phase_kind"] != "business_ideation"
        ]
        without_business_stage = _normalize_roadmap_nodes(without_business_stage)
        self.assertTrue(any(
            "business_ideation" in issue
            for issue in _validate_roadmap_nodes(
                without_business_stage,
                {"current_level": "beginner"},
                "Full Stack Developer",
            )
        ))

    def test_related_roadmap_competencies_cannot_be_collapsed_into_one_lesson(self):
        coverage = {
            "HTML": ("html",),
            "CSS": ("css",),
            "JavaScript": ("javascript",),
        }
        collapsed = [{
            "title": "HTML, CSS, and JavaScript basics",
            "objective": "Build a webpage",
            "skills": ["HTML", "CSS", "JavaScript"],
        }]
        self.assertEqual(
            set(_topics_without_dedicated_lessons(collapsed, coverage)),
            {"CSS", "JavaScript"},
        )

    def test_schedule_preserves_planned_weeks_for_lessons_and_phase_projects(self):
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
            roadmap = Roadmap(
                user_id="test-user",
                goal="Test goal",
                nodes=[
                    {
                        "id": "lesson-1", "title": "HTML structure", "phase": 1, "week": 2,
                        "phase_title": "Foundations", "skills": ["HTML", "CSS"],
                        "projects": ["Accessible landing page"],
                    },
                    {
                        "id": "lesson-2", "title": "JavaScript interactions", "phase": 2, "week": 4,
                        "phase_title": "Frontend", "skills": ["JavaScript", "DOM"],
                        "projects": ["Interactive product page"],
                    },
                ],
            )
            session.add(roadmap)
            session.commit()
            session.refresh(roadmap)

            asyncio.run(functions.generate_schedule(
                {"roadmapId": roadmap.id, "availableDays": ["saturday", "sunday"]},
                session,
                "test-user",
            ))
            lessons = session.exec(
                select(Lesson).where(Lesson.roadmap_id == roadmap.id).order_by(Lesson.order)
            ).all()

            self.assertEqual([lesson.week for lesson in lessons], [2, 2, 4, 4, 4])
            stage_projects = [
                lesson for lesson in lessons
                if lesson.node_id.startswith("stage_project_")
                and lesson.node_id != "stage_project_final"
            ]
            self.assertEqual(len(stage_projects), 2)
            capstone = next(lesson for lesson in lessons if lesson.node_id == "stage_project_final")
            self.assertEqual(capstone.week, 4)
            self.assertIn("HTML", stage_projects[0].task["description"])
            self.assertNotIn("JavaScript", stage_projects[0].task["description"])
            self.assertIn("HTML", stage_projects[1].task["description"])
            self.assertIn("JavaScript", stage_projects[1].task["description"])
            self.assertIn("Interactive product page", stage_projects[1].task["description"])
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
