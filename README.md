# Ticket App

Приложение для управления заявками.

## Стек

**Backend:**
- Python 3.11+
- FastAPI
- SQLAlchemy 2.x (async)
- Pydantic v2
- SQLite (aiosqlite)
- JWT авторизация

**Frontend:**
- React 18
- TypeScript
- Vite
- TailwindCSS
- Axios


## Установка и запуск

### Backend

```bash
cd backend

# Создание виртуального окружения
python -m venv .venv

# Активация
# macOS/Linux:
source .venv/bin/activate
# Windows:
.venv\Scripts\activate

# Установка зависимостей
pip install -r requirements.txt

# Запуск сервера
uvicorn main:app --reload --port 8000
```
```bash
### Frontend
cd frontend

# Установка зависимостей
npm install

# Запуск dev-сервера
npm run dev
```
