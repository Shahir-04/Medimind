import smtplib
import ssl
import secrets
import os
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import httpx

load_dotenv()

SMTP_EMAIL = os.getenv("SMTP_EMAIL", "admin.medimind@gmail.com")
SMTP_APP_PASSWORD = os.getenv("SMTP_APP_PASSWORD", "")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").lower() == "true"
SMTP_TIMEOUT_SECONDS = int(os.getenv("SMTP_TIMEOUT_SECONDS", "10"))
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "MediMind")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
GMAIL_SMTP_HOSTS = {"smtp.gmail.com", "gmail-smtp-msa.l.google.com"}
GMAIL_EMAIL = os.getenv("GMAIL_EMAIL") or SMTP_EMAIL
GMAIL_CLIENT_ID = os.getenv("GMAIL_CLIENT_ID", "")
GMAIL_CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET", "")
GMAIL_REFRESH_TOKEN = os.getenv("GMAIL_REFRESH_TOKEN", "")
GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


def generate_verification_code(length: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


def _verification_email_content(code: str) -> tuple[str, str]:
    html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
            <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <div style="background: linear-gradient(135deg, #3b82f6 0%, #0ea5e9 100%); border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 10px 40px rgba(59, 130, 246, 0.3);">
                    <h1 style="color: white; margin: 0 0 20px 0; font-size: 32px; font-weight: 700;">MediMind</h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 18px;">Your Personal AI Medical Assistant</p>
                </div>
                
                <div style="background: white; border-radius: 16px; padding: 40px; margin-top: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                    <h2 style="color: #1e293b; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Verify Your Email</h2>
                    <p style="color: #64748b; margin: 0 0 30px 0; font-size: 16px; line-height: 1.6;">
                        Welcome to MediMind! Please use the verification code below to complete your registration.
                    </p>
                    
                    <div style="background: #f1f5f9; border-radius: 12px; padding: 24px; margin: 30px 0;">
                        <p style="color: #64748b; margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your verification code</p>
                        <div style="font-size: 36px; font-weight: 700; color: #3b82f6; letter-spacing: 8px; font-family: monospace;">{code}</div>
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                    <p style="color: #94a3b8; font-size: 13px; margin: 0;">This code expires in 24 hours.</p>
                    <p style="color: #94a3b8; font-size: 13px; margin: 10px 0 0 0;">
                        If you didn't create an account, you can safely ignore this email.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

    text_content = f"""
        Welcome to MediMind!
        
        Your verification code is: {code}
        
        This code expires in 24 hours.
        If you didn't create an account, you can safely ignore this email.
        """

    return text_content, html_content


def _gmail_api_configured() -> bool:
    return all(
        [
            GMAIL_EMAIL,
            GMAIL_CLIENT_ID,
            GMAIL_CLIENT_SECRET,
            GMAIL_REFRESH_TOKEN,
        ]
    )


def _send_verification_email_via_gmail_api(to_email: str, code: str) -> bool:
    try:
        token_payload = {
            "client_id": GMAIL_CLIENT_ID,
            "client_secret": GMAIL_CLIENT_SECRET,
            "refresh_token": GMAIL_REFRESH_TOKEN,
            "grant_type": "refresh_token",
        }

        text_content, html_content = _verification_email_content(code)
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Verify your MediMind account"
        msg["From"] = f"{SMTP_FROM_NAME} <{GMAIL_EMAIL}>"
        msg["To"] = to_email
        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        raw_message = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

        with httpx.Client(timeout=SMTP_TIMEOUT_SECONDS) as client:
            token_response = client.post(GMAIL_TOKEN_URL, data=token_payload)
            if token_response.status_code != 200:
                print(
                    "[Email] Failed to refresh Gmail API access token: "
                    f"{token_response.text}"
                )
                return False

            access_token = token_response.json().get("access_token")
            if not access_token:
                print("[Email] Gmail API token response did not include access_token")
                return False

            send_response = client.post(
                GMAIL_SEND_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={"raw": raw_message},
            )
            if send_response.status_code != 200:
                print(f"[Email] Gmail API send failed: {send_response.text}")
                return False

        print(f"[Email] Verification email sent to {to_email} via Gmail API")
        return True
    except Exception as e:
        print(f"[Email] Failed to send verification email via Gmail API: {e}")
        return False


def send_verification_email(to_email: str, code: str) -> bool:
    if _gmail_api_configured():
        return _send_verification_email_via_gmail_api(to_email, code)

    if not SMTP_APP_PASSWORD:
        print("[Email] SMTP_APP_PASSWORD is not configured")
        return False
    if SMTP_HOST.lower() in GMAIL_SMTP_HOSTS and SMTP_PORT == 2525:
        print("[Email] Gmail SMTP does not support port 2525. Use 587 or 465.")
        return False

    try:
        text_content, html_content = _verification_email_content(code)
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Verify your MediMind account"
        msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_EMAIL}>"
        msg["To"] = to_email

        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        context = ssl.create_default_context()

        if SMTP_USE_SSL:
            with smtplib.SMTP_SSL(
                SMTP_HOST, SMTP_PORT, context=context, timeout=SMTP_TIMEOUT_SECONDS
            ) as server:
                server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
                server.sendmail(SMTP_EMAIL, to_email, msg.as_string())
        else:
            with smtplib.SMTP(
                SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS
            ) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
                server.sendmail(SMTP_EMAIL, to_email, msg.as_string())

        print(
            f"[Email] Verification email sent to {to_email} via SMTP "
            f"{SMTP_HOST}:{SMTP_PORT} ({'SSL' if SMTP_USE_SSL else 'STARTTLS'})"
        )
        return True

    except Exception as e:
        print(f"[Email] Failed to send verification email: {e}")
        return False


def get_expiration_time(hours: int = 24) -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=hours)
