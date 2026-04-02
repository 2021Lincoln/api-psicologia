import enum
from datetime import date, datetime, time
from decimal import Decimal
from typing import List, Optional
from uuid import UUID, uuid4

from sqlalchemy import Column, Text
from sqlmodel import Field, Relationship, SQLModel


# Enums ---------------------------------------------------------------------


class UserRole(str, enum.Enum):
    patient = "patient"
    psychologist = "psychologist"
    admin = "admin"


class WeekDay(int, enum.Enum):
    monday = 0
    tuesday = 1
    wednesday = 2
    thursday = 3
    friday = 4
    saturday = 5
    sunday = 6


class AppointmentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    cancelled = "cancelled"


class RecordingStatus(str, enum.Enum):
    pending = "pending"
    downloading = "downloading"
    transcribing = "transcribing"
    done = "done"
    error = "error"


class TranscriptStatus(str, enum.Enum):
    processing = "processing"
    done = "done"
    failed = "failed"


class RiskLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Sex(str, enum.Enum):
    male = "male"
    female = "female"
    other = "other"


# User ----------------------------------------------------------------------


class UserBase(SQLModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(unique=True, index=True, max_length=254)
    phone: Optional[str] = Field(default=None, max_length=20)
    role: UserRole = Field(default=UserRole.patient)
    is_active: bool = Field(default=True)
    avatar_url: Optional[str] = Field(default=None, max_length=500)
    sex: Optional[Sex] = Field(default=None)


class User(UserBase, table=True):
    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    hashed_password: str

    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    psychologist_profile: Optional["PsychologistProfile"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"uselist": False},
    )
    appointments_as_patient: List["Appointment"] = Relationship(
        back_populates="patient",
        sa_relationship_kwargs={"foreign_keys": "[Appointment.patient_id]"},
    )
    reviews: List["Review"] = Relationship(
        back_populates="patient",
        sa_relationship_kwargs={"foreign_keys": "[Review.patient_id]"},
    )


# PsychologistProfile -------------------------------------------------------


class PsychologistProfileBase(SQLModel):
    crp: str = Field(unique=True, index=True, min_length=4, max_length=20, description="Número do CRP")
    bio: Optional[str] = Field(default=None, max_length=2000)
    specialties: Optional[str] = Field(default=None, max_length=500, description="Especialidades separadas por vírgula")
    hourly_rate: Decimal = Field(decimal_places=2, max_digits=8, ge=0, description="Valor por hora em BRL")
    session_duration_minutes: int = Field(default=50, ge=15, le=120, description="Duração padrão da sessão em minutos")
    is_accepting_patients: bool = Field(default=True)
    is_verified: bool = Field(default=False, description="Aprovado por admin após conferência no CFP")
    gender: Optional[str] = Field(default=None, max_length=1, description="Gênero: F (feminino), M (masculino)")
    accent_color: Optional[str] = Field(default=None, max_length=30, description="Chave de cor do perfil público")


class PsychologistProfile(PsychologistProfileBase, table=True):
    __tablename__ = "psychologist_profiles"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", unique=True, index=True)

    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    user: Optional["User"] = Relationship(back_populates="psychologist_profile")
    availabilities: List["Availability"] = Relationship(back_populates="psychologist_profile")
    appointments: List["Appointment"] = Relationship(
        back_populates="psychologist",
        sa_relationship_kwargs={"foreign_keys": "[Appointment.psychologist_profile_id]"},
    )
    reviews: List["Review"] = Relationship(back_populates="psychologist_profile")
    notes: List["Note"] = Relationship(back_populates="psychologist_profile")


# Availability ---------------------------------------------------------------


class AvailabilityBase(SQLModel):
    specific_date: date = Field(description="Data específica de atendimento (YYYY-MM-DD)")
    start_time: time = Field(description="Horário de início da janela disponível")
    end_time: time = Field(description="Horário de fim da janela disponível")
    is_active: bool = Field(default=True)


class Availability(AvailabilityBase, table=True):
    __tablename__ = "availabilities"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    psychologist_profile_id: UUID = Field(foreign_key="psychologist_profiles.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    psychologist_profile: "PsychologistProfile" = Relationship(back_populates="availabilities")


# Appointment ---------------------------------------------------------------


class AppointmentBase(SQLModel):
    scheduled_at: datetime = Field(description="Data e hora de início da sessão (UTC)")
    duration_minutes: int = Field(default=50, ge=15, le=120)
    price: Decimal = Field(decimal_places=2, max_digits=8, ge=0, description="Valor cobrado nesta sessão em BRL")
    status: AppointmentStatus = Field(default=AppointmentStatus.pending)
    notes: Optional[str] = Field(default=None, max_length=1000)


class Appointment(AppointmentBase, table=True):
    __tablename__ = "appointments"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    patient_id: UUID = Field(foreign_key="users.id", index=True)
    psychologist_profile_id: UUID = Field(foreign_key="psychologist_profiles.id", index=True)

    stripe_payment_intent_id: Optional[str] = Field(
        default=None, index=True, max_length=100, description="Stripe PaymentIntent ID"
    )
    stripe_checkout_session_id: Optional[str] = Field(default=None, index=True, max_length=100)

    daily_room_name: Optional[str] = Field(default=None, max_length=200)
    daily_room_url: Optional[str] = Field(
        default=None, max_length=500, description="URL base da sala Daily.co (não exposta diretamente ao frontend)"
    )

    paid_at: Optional[datetime] = Field(default=None)
    cancelled_at: Optional[datetime] = Field(default=None)
    cancellation_reason: Optional[str] = Field(default=None, max_length=500)

    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    patient: "User" = Relationship(
        back_populates="appointments_as_patient",
        sa_relationship_kwargs={"foreign_keys": "[Appointment.patient_id]"},
    )
    psychologist: "PsychologistProfile" = Relationship(
        back_populates="appointments",
        sa_relationship_kwargs={"foreign_keys": "[Appointment.psychologist_profile_id]"},
    )
    review: Optional["Review"] = Relationship(
        back_populates="appointment",
        sa_relationship_kwargs={"uselist": False},
    )


# Review --------------------------------------------------------------------


class Review(SQLModel, table=True):
    __tablename__ = "reviews"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    appointment_id: UUID = Field(foreign_key="appointments.id", unique=True, index=True)
    patient_id: UUID = Field(foreign_key="users.id", index=True)
    psychologist_profile_id: UUID = Field(foreign_key="psychologist_profiles.id", index=True)
    rating: int = Field(ge=1, le=5, description="Nota de 1 a 5")
    comment: Optional[str] = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    appointment: "Appointment" = Relationship(back_populates="review")
    patient: "User" = Relationship(
        back_populates="reviews",
        sa_relationship_kwargs={"foreign_keys": "[Review.patient_id]"},
    )
    psychologist_profile: "PsychologistProfile" = Relationship(back_populates="reviews")


# Note (professional reminders) ---------------------------------------------


class Note(SQLModel, table=True):
    __tablename__ = "notes"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    psychologist_profile_id: UUID = Field(foreign_key="psychologist_profiles.id", index=True)
    content: str = Field(max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    psychologist_profile: "PsychologistProfile" = Relationship(back_populates="notes")


# Refresh tokens ------------------------------------------------------------


class RefreshToken(SQLModel, table=True):
    __tablename__ = "refresh_tokens"

    jti: str = Field(primary_key=True, max_length=64)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    expires_at: datetime
    revoked_at: Optional[datetime] = None


class PasswordResetToken(SQLModel, table=True):
    __tablename__ = "password_reset_tokens"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    token: str = Field(unique=True, index=True, max_length=64)
    expires_at: datetime
    used: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


# SessionRecording ----------------------------------------------------------


class SessionRecording(SQLModel, table=True):
    """Metadados da gravação da sessão (Daily.co cloud recording)."""
    __tablename__ = "session_recordings"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    appointment_id: UUID = Field(foreign_key="appointments.id", unique=True, index=True)
    daily_recording_id: Optional[str] = Field(default=None, max_length=200)
    recording_url: Optional[str] = Field(default=None, max_length=1000)
    duration_seconds: Optional[int] = Field(default=None)
    file_size_bytes: Optional[int] = Field(default=None)
    status: RecordingStatus = Field(default=RecordingStatus.pending)
    error_message: Optional[str] = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


# SessionTranscript ---------------------------------------------------------


class SessionTranscript(SQLModel, table=True):
    """Transcrição completa da sessão (Whisper API)."""
    __tablename__ = "session_transcripts"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    appointment_id: UUID = Field(foreign_key="appointments.id", unique=True, index=True)
    # Texto completo concatenado com tags de falante
    full_text: Optional[str] = Field(default=None, sa_column=Column(Text))
    # JSON: lista de {speaker, text, start_ms, end_ms}
    segments: str = Field(default="[]", sa_column=Column(Text))
    language: str = Field(default="pt-BR", max_length=10)
    word_count: int = Field(default=0)
    status: TranscriptStatus = Field(default=TranscriptStatus.processing)
    transcribed_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


# SessionSummary (prontuário clínico gerado por IA) -------------------------


class SessionSummary(SQLModel, table=True):
    """Prontuário clínico gerado por IA a partir da transcrição."""
    __tablename__ = "session_summaries"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    appointment_id: UUID = Field(foreign_key="appointments.id", unique=True, index=True)

    # ── Campos clínicos (todos editáveis pela psicóloga) ──────────────────────
    chief_complaint: Optional[str] = Field(default=None, sa_column=Column(Text))
    mental_status: Optional[str] = Field(default=None, sa_column=Column(Text))
    diagnostic_hypotheses: Optional[str] = Field(default=None, sa_column=Column(Text))
    interventions: Optional[str] = Field(default=None, sa_column=Column(Text))
    session_content: Optional[str] = Field(default=None, sa_column=Column(Text))
    patient_evolution: Optional[str] = Field(default=None, sa_column=Column(Text))
    therapeutic_plan: Optional[str] = Field(default=None, sa_column=Column(Text))
    next_steps: Optional[str] = Field(default=None, sa_column=Column(Text))
    risk_level: RiskLevel = Field(default=RiskLevel.low)
    additional_notes: Optional[str] = Field(default=None, sa_column=Column(Text))

    # ── Metadados da geração ──────────────────────────────────────────────────
    ai_model_used: Optional[str] = Field(default=None, max_length=100)
    ai_generated_at: Optional[datetime] = Field(default=None)
    langfuse_trace_id: Optional[str] = Field(default=None, max_length=200)
    last_edited_by: Optional[UUID] = Field(default=None, foreign_key="users.id")
    last_edited_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


# Schemas -------------------------------------------------------------------


class UserCreate(UserBase):
    password: str = Field(min_length=8)


class UserRead(UserBase):
    id: UUID
    created_at: datetime


class PsychologistProfileCreate(PsychologistProfileBase):
    pass


class PsychologistProfileRead(PsychologistProfileBase):
    id: UUID
    user_id: UUID
    user: Optional[UserRead] = None
    is_verified: bool = False


class AvailabilityCreate(AvailabilityBase):
    psychologist_profile_id: UUID


class AvailabilityRead(AvailabilityBase):
    id: UUID
    psychologist_profile_id: UUID
    specific_date: date


class AppointmentCreate(AppointmentBase):
    patient_id: UUID
    psychologist_profile_id: UUID


class AppointmentRead(AppointmentBase):
    id: UUID
    patient_id: UUID
    psychologist_profile_id: UUID
    patient_full_name: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None
    stripe_checkout_session_id: Optional[str] = None
    daily_room_name: Optional[str] = None
    daily_room_url: Optional[str] = None
    paid_at: Optional[datetime]
    cancelled_at: Optional[datetime]
    created_at: datetime


class ReviewRead(SQLModel):
    id: UUID
    appointment_id: UUID
    patient_id: UUID
    psychologist_profile_id: UUID
    rating: int
    comment: Optional[str] = None
    patient_name: Optional[str] = None
    created_at: datetime
