"""API for English question practice."""

import os
import random
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, time, timedelta, timezone
from typing import Generator

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    func,
    select,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)

DATABASE_URL = os.getenv(
    "DATABASE_URL", "sqlite:///./english_practice.db"
)
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    prompt: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    hint: Mapped[str] = mapped_column(Text, default="")
    stage: Mapped[int] = mapped_column(Integer, default=1)
    score: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Settings(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    stage_one_threshold: Mapped[int] = mapped_column(Integer, default=10)
    stage_two_threshold: Mapped[int] = mapped_column(Integer, default=10)
    stage_two_return_score: Mapped[int] = mapped_column(Integer, default=6)


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))
    round_id: Mapped[str] = mapped_column(String(36), index=True)
    submitted_answer: Mapped[str] = mapped_column(Text)
    correct: Mapped[bool] = mapped_column(Boolean)
    attempt_number: Mapped[int] = mapped_column(Integer)
    question: Mapped[Question] = relationship()


class PracticeRound(Base):
    __tablename__ = "practice_rounds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"), index=True)
    stage: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    correct: Mapped[bool] = mapped_column(Boolean, default=False)


class QuestionIn(BaseModel):
    prompt: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    hint: str = ""
    stage: int = Field(default=1, ge=1, le=3)


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    prompt: str
    answer: str
    hint: str
    stage: int
    score: int
    active: bool


class AnswerIn(BaseModel):
    answer: str
    round_id: str
    duration_seconds: int = Field(default=0, ge=0, le=86400)


class SettingsIn(BaseModel):
    stage_one_threshold: int = Field(ge=1)
    stage_two_threshold: int = Field(ge=1)
    stage_two_return_score: int = Field(ge=0)


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    stage_one_threshold: int
    stage_two_threshold: int
    stage_two_return_score: int


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def normalize(value: str) -> str:
    return "".join(character for character in value.casefold() if character.isalnum())


def get_settings(db: Session) -> Settings:
    settings = db.get(Settings, 1)
    if settings is None:
        settings = Settings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        get_settings(db)
    yield


app = FastAPI(title="English Practice API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/questions", response_model=list[QuestionOut])
def list_questions(db: Session = Depends(get_db)) -> list[Question]:
    return list(db.scalars(select(Question).order_by(Question.id.desc())))


@app.post("/api/questions", response_model=QuestionOut, status_code=201)
def create_question(payload: QuestionIn, db: Session = Depends(get_db)) -> Question:
    question = Question(**payload.model_dump())
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@app.put("/api/questions/{question_id}", response_model=QuestionOut)
def update_question(
    question_id: int, payload: QuestionIn, db: Session = Depends(get_db)
) -> Question:
    question = db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found.")

    updated_values = payload.model_dump()
    if question.stage != updated_values["stage"]:
        question.score = 0
    for field, value in updated_values.items():
        setattr(question, field, value)

    db.commit()
    db.refresh(question)
    return question


@app.delete("/api/questions/{question_id}", status_code=204)
def delete_question(question_id: int, db: Session = Depends(get_db)) -> None:
    question = db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found.")
    db.query(Attempt).filter_by(question_id=question_id).delete(
        synchronize_session=False
    )
    db.query(PracticeRound).filter_by(question_id=question_id).delete(
        synchronize_session=False
    )
    db.delete(question)
    db.commit()


@app.get("/api/practice/next")
def next_question(
    stage: int = Query(default=1, ge=1, le=3), db: Session = Depends(get_db)
) -> dict[str, object]:
    questions = list(
        db.scalars(
            select(Question).where(
                Question.active.is_(True), Question.stage == stage
            )
        )
    )
    if not questions:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No questions found for Level {stage}. "
                "Add a question or choose another level."
            ),
        )
    question = random.choice(questions)
    round_id = str(uuid.uuid4())
    db.add(
        PracticeRound(
            id=round_id,
            question_id=question.id,
            stage=question.stage,
            started_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    return {
        "id": question.id,
        "round_id": round_id,
        "prompt": question.prompt,
        "stage": question.stage,
        "score": question.score,
    }


@app.post("/api/practice/{question_id}/answer")
def answer_question(
    question_id: int, payload: AnswerIn, db: Session = Depends(get_db)
) -> dict[str, object]:
    question = db.get(Question, question_id)
    if question is None or not question.active:
        raise HTTPException(status_code=404, detail="Question not found.")

    practice_round = db.get(PracticeRound, payload.round_id)
    if practice_round is None or practice_round.question_id != question_id:
        raise HTTPException(status_code=404, detail="Practice session not found.")
    practice_round.duration_seconds = max(
        practice_round.duration_seconds, payload.duration_seconds
    )

    attempt_number = (
        db.query(Attempt)
        .filter_by(question_id=question_id, round_id=payload.round_id)
        .count()
        + 1
    )
    correct = normalize(payload.answer) == normalize(question.answer)
    db.add(
        Attempt(
            question_id=question_id,
            round_id=payload.round_id,
            submitted_answer=payload.answer,
            correct=correct,
            attempt_number=attempt_number,
        )
    )
    reward = 2 if attempt_number == 1 else 1
    response: dict[str, object] = {
        "correct": correct,
        "attempt_number": attempt_number,
        "stage": question.stage,
        "score": question.score,
        "done": False,
    }

    if correct:
        question.score += reward
        settings = get_settings(db)
        threshold = (
            settings.stage_one_threshold
            if question.stage == 1
            else settings.stage_two_threshold
        )
        if question.stage < 3 and question.score >= threshold:
            question.stage += 1
            question.score = 0
            response["stage_up"] = True
        response["done"] = True
        response["message"] = "Correct!"
        response["answer"] = question.answer
        response["score"] = question.score
        response["stage"] = question.stage
    elif attempt_number >= 3:
        response["done"] = True
        response["reveal_answer"] = True
        response["answer"] = question.answer
        response["message"] = "Answer: " + question.answer
        if question.stage == 1:
            question.score = max(0, question.score - 1)
        elif question.stage == 2:
            question.score = max(0, question.score - 2)
        else:
            settings = get_settings(db)
            question.stage = 2
            question.score = settings.stage_two_return_score
            response["stage_down"] = True
        response["score"] = question.score
        response["stage"] = question.stage
    elif attempt_number == 2:
        response["hint"] = question.hint or "Try to remember the answer."
        response["message"] = "Try once more."
    else:
        response["message"] = "That answer is incorrect. Try again."

    if response["done"]:
        practice_round.completed = True
        practice_round.correct = bool(correct)
        practice_round.completed_at = datetime.now(timezone.utc)

    db.commit()
    return response


@app.get("/api/dashboard")
def read_dashboard(
    period: str = Query(default="7", pattern="^(7|30|all)$"),
    timezone_offset_minutes: int = Query(default=0, ge=-840, le=840),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    local_timezone = timezone(timedelta(minutes=-timezone_offset_minutes))
    today = datetime.now(timezone.utc).astimezone(local_timezone).date()
    days = 0 if period == "all" else int(period)
    first_day = today - timedelta(days=days - 1) if days else today
    start_utc = (
        datetime.combine(first_day, time.min, local_timezone).astimezone(timezone.utc)
        if days
        else None
    )
    query = select(PracticeRound).order_by(PracticeRound.started_at)
    if start_utc is not None:
        query = query.where(PracticeRound.started_at >= start_utc)
    rounds = list(
        db.scalars(query)
    )
    local_dates = []
    for practice_round in rounds:
        started_at = practice_round.started_at
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        local_dates.append(started_at.astimezone(local_timezone).date())
    if not days and local_dates:
        first_day = min(local_dates)
    monthly = period == "all"
    daily: dict[str, dict[str, object]] = {}
    if monthly:
        cursor = first_day.replace(day=1)
        last_month = today.replace(day=1)
        while cursor <= last_month:
            key = cursor.isoformat()
            daily[key] = {
                "date": key,
                "duration_seconds": 0,
                "questions_answered": 0,
                "correct_answers": 0,
                "accuracy_percent": 0,
            }
            cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
    else:
        for index in range(days):
            day = first_day + timedelta(days=index)
            daily[day.isoformat()] = {
                "date": day.isoformat(),
                "duration_seconds": 0,
                "questions_answered": 0,
                "correct_answers": 0,
                "accuracy_percent": 0,
            }
    active_dates: set[str] = set()
    for practice_round in rounds:
        started_at = practice_round.started_at
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        local_date = started_at.astimezone(local_timezone).date()
        day_key = local_date.replace(day=1).isoformat() if monthly else local_date.isoformat()
        row = daily.get(day_key)
        if row is None:
            continue
        if practice_round.duration_seconds > 0 or practice_round.completed:
            active_dates.add(local_date.isoformat())
        row["duration_seconds"] += practice_round.duration_seconds
        if practice_round.completed:
            row["questions_answered"] += 1
            row["correct_answers"] += int(practice_round.correct)
    for row in daily.values():
        answered = int(row["questions_answered"])
        row["accuracy_percent"] = round(
            100 * int(row["correct_answers"]) / answered
        ) if answered else 0

    total_seconds = sum(int(row["duration_seconds"]) for row in daily.values())
    total_answered = sum(int(row["questions_answered"]) for row in daily.values())
    total_correct = sum(int(row["correct_answers"]) for row in daily.values())
    return {
        "period": period,
        "days": (today - first_day).days + 1,
        "granularity": "month" if monthly else "day",
        "total_questions_answered": total_answered,
        "correct_answers": total_correct,
        "accuracy_percent": round(100 * total_correct / total_answered)
        if total_answered
        else 0,
        "total_seconds": total_seconds,
        "active_days": len(active_dates),
        "average_seconds_per_question": round(total_seconds / total_answered)
        if total_answered
        else 0,
        "daily": list(daily.values()),
    }


@app.get("/api/settings", response_model=SettingsOut)
def read_settings(db: Session = Depends(get_db)) -> Settings:
    return get_settings(db)


@app.put("/api/settings", response_model=SettingsOut)
def update_settings(payload: SettingsIn, db: Session = Depends(get_db)) -> Settings:
    settings = get_settings(db)
    for key, value in payload.model_dump().items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings
