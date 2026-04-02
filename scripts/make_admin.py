"""
Promove um usuário existente para role=admin.

Uso:
    python scripts/make_admin.py email@exemplo.com
"""
import asyncio
import sys

from sqlalchemy import select, text

from app.db.session import AsyncSessionLocal
from app.models.domain import User, UserRole


async def make_admin(email: str) -> None:
    async with AsyncSessionLocal() as db:
        # Garantir que o enum 'admin' existe no PostgreSQL
        await db.execute(
            text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'admin'")
        )
        await db.commit()

        user = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()

        if user is None:
            print(f"[ERRO] Usuário com e-mail '{email}' não encontrado.")
            sys.exit(1)

        if user.role == UserRole.admin:
            print(f"[INFO] {email} já é admin.")
            return

        user.role = UserRole.admin
        db.add(user)
        await db.commit()
        print(f"[OK] {email} agora é admin.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python scripts/make_admin.py <email>")
        sys.exit(1)
    asyncio.run(make_admin(sys.argv[1]))
