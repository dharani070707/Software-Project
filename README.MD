# Hospital Management System

A modern full-stack Hospital Management System built using Spring Boot, Java 21, PostgreSQL, Thymeleaf, and Tailwind CSS.

---

## Overview

This project is designed to digitize hospital workflows and simplify patient, doctor, and appointment management through an integrated web platform.

The system provides role-based access for administrators, doctors, and patients with secure authentication and real-time scheduling features.

---

## Features

### Patient Module
- Patient registration and login
- Book appointments online
- View appointment history
- Manage profile information

### Doctor Module
- View assigned appointments
- Manage schedules
- Access patient information
- Update appointment status

### Admin Module
- Manage users and roles
- Monitor appointments
- Configure hospital operations
- Dashboard analytics

---

## Technology Stack

### Backend
- Java 21
- Spring Boot 3
- Spring Security
- Spring Data JPA
- Hibernate

### Frontend
- Thymeleaf
- Tailwind CSS
- HTML5
- JavaScript

### Database
- PostgreSQL

### DevOps
- Docker
- Docker Compose

---

## Project Architecture

```text
Controller Layer
↓
Service Layer
↓
Repository Layer
↓
Database
```

---

## Security Features

- Role-based authentication
- BCrypt password encryption
- CSRF protection
- Secure session handling

---

## Database Design

```text
Users
Patients
Doctors
Appointments
Schedules
```

---

## Installation

### Clone Repository

```bash
git clone https://github.com/dharani070707/Software-Project.git
cd Software-Project
```

---

## Configure Database

Update the database configuration inside:

```text
src/main/resources/application.properties
```

Example:

```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/hospital_db
spring.datasource.username=postgres
spring.datasource.password=yourpassword
```

---

## Run Using Maven Wrapper

### Windows

```bash
mvnw.cmd spring-boot:run
```

### Linux / Mac

```bash
./mvnw spring-boot:run
```

---

## Docker Deployment

```bash
docker-compose up --build
```

---

## Default Access

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@hospital.com | password |
| Doctor | sarah@hospital.com | password |
| Patient | patient@hospital.com | password |

---

## End-to-End Tests (Playwright)

The `e2e/` folder holds the CSE731 test suite: Playwright + TypeScript,
run on Chromium, Firefox and WebKit. Tests also query PostgreSQL directly to
confirm that UI actions really changed the database.

### 1. Start the app against a local database

```bash
createdb hospitaldb
SPRING_DATASOURCE_USERNAME=<db user> SPRING_DATASOURCE_PASSWORD=<db password> ./mvnw spring-boot:run
```

The app listens on **http://localhost:8081** and seeds the three users above.

### 2. Install and run the tests

```bash
cd e2e
npm ci
npx playwright install          # downloads the three browsers
export PGUSER=<db user> PGPASSWORD=<db password>   # PGDATABASE defaults to hospitaldb
npm test                        # all browsers
npm run test:chromium           # one browser, faster while developing
npm run report                  # open the HTML report
npm run summary                 # pass/fail tables from results.json
```

| Folder | What it covers |
|---|---|
| `tests/auth` | login, logout, registration |
| `tests/appointments` | booking and who can see a booking |
| `tests/workflow` | full multi-role critical paths |
| `tests/admin` | admin edits and deletes |
| `tests/negative` | bypass testing, unauthorized access (session-based), network failures |

Tests run one at a time (`workers: 1`) because they share one database. Each
test creates its own users with unique emails, so the database never needs
resetting between runs.

---

## Main Functionalities

- Authentication & Authorization
- Appointment Scheduling
- Patient Record Management
- Doctor Dashboard
- Admin Dashboard
- Real-Time Calendar Integration
- Responsive UI

---

## Deployment

This project can be deployed on:

- Render
- Railway
- Docker
- AWS
- Azure

---

## Screenshots

Add screenshots here after deployment.

---

## Future Improvements

- AI-based symptom analysis
- Online video consultation
- E-prescription generation
- Email notifications
- Mobile application support

---

## License

This project is developed for educational and learning purposes.
