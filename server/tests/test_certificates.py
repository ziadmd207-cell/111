import asyncio
from io import BytesIO
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from starlette.datastructures import UploadFile

from app.models import Certificate, Notification, User
from app.routers import certificates


class CertificateTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.admin = User(id="admin", email="admin@example.com", role="admin")
        self.user = User(id="user", email="learner@example.com", full_name="Learner")
        self.session.add_all([self.admin, self.user])
        self.session.commit()
        self.tempdir = tempfile.TemporaryDirectory()
        self.directory_patch = patch.object(certificates, "CERTIFICATES_DIR", self.tempdir.name)
        self.directory_patch.start()

    def tearDown(self):
        self.directory_patch.stop()
        self.session.close()
        self.engine.dispose()
        self.tempdir.cleanup()

    def send_pdf(self):
        return asyncio.run(certificates.admin_send_certificate(
            recipient_email=" LEARNER@example.com ",
            title="Python completion",
            file=UploadFile(filename="completion.pdf", file=BytesIO(b"%PDF-1.7\ncertificate")),
            session=self.session,
            admin=self.admin,
        ))

    def test_admin_sends_certificate_to_matching_account_and_user_can_access_it(self):
        result = self.send_pdf()["certificate"]
        record = self.session.exec(select(Certificate)).one()
        notification = self.session.exec(select(Notification).where(Notification.user_id == self.user.id)).one()

        self.assertEqual(record.user_id, self.user.id)
        self.assertEqual(result["title"], "Python completion")
        self.assertEqual(notification.type, "certificate")
        self.assertEqual(notification.action_url, "/certificates")
        self.assertTrue(os.path.isfile(os.path.join(self.tempdir.name, record.file_key)))

        mine = certificates.user_list_certificates(user_id=self.user.id, session=self.session)
        self.assertEqual(len(mine["certificates"]), 1)
        with self.assertRaises(HTTPException) as denied:
            certificates.user_certificate_file(
                record.id,
                user_id="another-user",
                session=self.session,
            )
        self.assertEqual(denied.exception.status_code, 404)

    def test_share_link_exposes_certificate_but_not_account_email(self):
        self.send_pdf()
        record = self.session.exec(select(Certificate)).one()

        shared = certificates.public_certificate(record.share_token, session=self.session)
        response = certificates.public_certificate_file(record.share_token, session=self.session)
        admin_history = certificates.admin_list_certificates(
            search="Learner",
            session=self.session,
            admin=self.admin,
        )

        self.assertEqual(shared["title"], "Python completion")
        self.assertNotIn("email", shared)
        self.assertTrue(shared["share_url"].endswith(record.share_token))
        self.assertEqual(admin_history["certificates"][0]["share_url"], shared["share_url"])
        self.assertEqual(response.path, os.path.join(self.tempdir.name, record.file_key))
        self.assertIn("inline", response.headers["content-disposition"])

    def test_unknown_recipient_and_mismatched_file_are_rejected(self):
        with self.assertRaises(HTTPException) as missing_user:
            asyncio.run(certificates.admin_send_certificate(
                recipient_email="missing@example.com",
                title="",
                file=UploadFile(filename="certificate.pdf", file=BytesIO(b"%PDF-1.7\nok")),
                session=self.session,
                admin=self.admin,
            ))
        self.assertEqual(missing_user.exception.status_code, 404)

        with self.assertRaises(HTTPException) as invalid_file:
            asyncio.run(certificates.admin_send_certificate(
                recipient_email=self.user.email,
                title="",
                file=UploadFile(filename="certificate.pdf", file=BytesIO(b"not a pdf")),
                session=self.session,
                admin=self.admin,
            ))
        self.assertEqual(invalid_file.exception.status_code, 400)
        self.assertEqual(self.session.exec(select(Certificate)).all(), [])
        self.assertEqual(os.listdir(self.tempdir.name), [])
