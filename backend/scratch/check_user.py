from app.database import SessionLocal
from app.models.models import User
from app.core.security import verify_password
import sys

def check_user(email, password):
    db = SessionLocal()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        print(f"User {email} not found")
        return
    
    print(f"User found: {user.full_name} (Role: {user.role})")
    print(f"Stored Hash: {user.password_hash}")
    
    match = verify_password(password, user.password_hash)
    print(f"Password match: {match}")
    db.close()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python check_user.py <email> <password>")
    else:
        check_user(sys.argv[1], sys.argv[2])
