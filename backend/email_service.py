import smtplib
import ssl
import secrets
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()

SMTP_EMAIL = os.getenv("SMTP_EMAIL", "medimindapp@gmail.com")
SMTP_APP_PASSWORD = os.getenv("SMTP_APP_PASSWORD", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def generate_verification_code(length: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


def send_verification_email(to_email: str, code: str) -> bool:
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Verify your MediMind account"
        msg["From"] = SMTP_EMAIL
        msg["To"] = to_email

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

        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        context = ssl.create_default_context()

        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
            server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
            server.sendmail(SMTP_EMAIL, to_email, msg.as_string())

        print(f"[Email] Verification email sent to {to_email}")
        return True

    except Exception as e:
        print(f"[Email] Failed to send verification email: {e}")
        return False


def get_expiration_time(hours: int = 24) -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=hours)
