# CloudBrink Documentation Portal

A full-stack web app built with React (frontend), Node.js + Express (backend),
and PostgreSQL (database).

---

## 1. Install Required Software

Install these before running the app:

1. **Node.js (with npm)**  
   Download from: https://nodejs.org/en/download/  
   Choose the LTS version.  
   Verify after install: node -v npm -v

2. **PostgreSQL**  
   Download from: https://www.postgresql.org/download/  
   Note your:

- Username: `postgres`
- Password: your chosen password
- Port: `5432`

3. **Git**  
   Download from: https://git-scm.com/downloads  
   Verify after install: git --version

---

## 2. Clone the Repository

Open your terminal and run:

git clone https://github.com/DheerajKommineni/CloudBrink.git

cd CloudBrink

---

## 3. Create Database

1. Open PostgreSQL shell or pgAdmin.

STEP 1: Open the PostgreSQL Shell (psql) • Windows

Search “SQL Shell (psql)” in the Start Menu and open it.

You’ll see a prompt like this:

Server [localhost]: Database [postgres]: Port [5432]: Username [postgres]:
Password for user postgres:

Just press Enter for the first three (server, database, port).

When asked for Password, type the password you set during installation.

⚠️ If you don’t remember setting one, see Step 2 below to create a new password.

• Mac / Linux

Open your terminal and run:

psql -U postgres

If you see Password for user postgres: and you don’t remember it, follow Step 2
below.

If it says “command not found”, reinstall PostgreSQL or add it to your PATH.

STEP 2: Set or Reset Your PostgreSQL Password

If you forgot or never set a password, run the following:

On Windows (inside SQL Shell): ALTER USER postgres PASSWORD 'postgres123';

On Mac / Linux (from Terminal): sudo -u postgres psql

Then inside psql:

ALTER USER postgres PASSWORD 'postgres123';

Exit:

\q

You’ve now created a password:

Username: postgres Password: postgres123

Keep these — you’ll need them for your .env file.

Step 3: Create the Database

Now connect again with your new password:

Windows (SQL Shell)

Press Enter for server, database, port, and username again, then type:

Password for user postgres: postgres123

Mac / Linux psql -U postgres -W

(Enter postgres123 when prompted.)

Then create and connect to the database:

CREATE DATABASE cloudbrink_docs; \c cloudbrink_docs

Step 4: Verify the Connection

You should now see something like:

You are now connected to database "cloudbrink_docs" as user "postgres".

If you do, PostgreSQL is ready!

2. Run:

CREATE DATABASE cloudbrink_docs; \c cloudbrink_docs

## 4. Create Tables

Run these SQL commands to set up your schema:

```sql
-- Create 'uploads' table
CREATE TABLE uploads (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  section VARCHAR(100) NOT NULL,
  filepath TEXT NOT NULL,
  file_size_mb NUMERIC(10,2),
  description TEXT,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  code VARCHAR(50),
  CONSTRAINT unique_filename UNIQUE (filename),
  CONSTRAINT uploads_filename_section_unique UNIQUE (filename, section)
);

-- Index for section lookups
CREATE INDEX idx_uploads_section ON uploads(section);

------------------------------------------------------------

-- Create 'converted_files' table
CREATE TABLE converted_files (
  id SERIAL PRIMARY KEY,
  upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
  md_filename VARCHAR(255) NOT NULL,
  md_path TEXT NOT NULL,
  converted_at TIMESTAMP DEFAULT NOW(),
  conversion_status VARCHAR(20) DEFAULT 'completed',
  error_message TEXT,
  code VARCHAR(50),
  CONSTRAINT converted_files_upload_id_unique UNIQUE (upload_id)
);

CREATE TABLE downloads (
  id SERIAL PRIMARY KEY,
  os_name VARCHAR(50),
  version VARCHAR(50),
  download_url TEXT,
  description TEXT,
  added_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO downloads (os_name, version, download_url, description)
VALUES
('windows', '14.4.462', 'https://cloudbrink.com/brink-app-dl/BrinkAgent-latest.msi', 'Click below to download the latest Windows app'),
('mac', '14.4.462', 'https://cloudbrink.com/brink-app-dl/BrinkAgent-latest.pkg', 'Click below to download the latest Mac app'),
('ubuntu', '14.4.462 – 22.04', 'https://cloudbrink.com/brink-app-dl/BrinkAgent-latest.deb', 'Click below to download the latest Ubuntu app');

## 5. Environment Variables

Create .env files in both the backend and frontend directories.

Backend (backend/.env)

PGUSER=postgres
PGPASSWORD=your_password or postgres123
PGDATABASE=cloudbrink_docs
PGHOST=localhost
PGPORT=5432
PORT=5000

Frontend (frontend/.env)

VITE_API_BASE_URL=http://localhost:5000

## 6. Run the Application

Start Backend
cd backend
npm run dev

Start Frontend (in another terminal)
cd frontend
npm run dev

## 7. Access the Application

Once both servers are running, open your browser and go to:

http://localhost:5173

## 8. Troubleshooting
Database not connecting

Ensure PostgreSQL is running.

Check your credentials in .env.

Verify the cloudbrink_docs database and tables exist.

npm install errors
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

Port already in use

Find the process using:

lsof -i :5000
lsof -i :5173


Then kill it:

kill -9 <PID>

## 9. Build for Production

To build the frontend for production:

cd frontend
npm run build


The production-ready files will be available in:

frontend/dist

## 10. Quick Setup Checklist

Node.js and npm installed

PostgreSQL running locally

Database cloudbrink_docs created

Tables created (uploads, converted_files, downloads)

.env files configured

Backend on port 5000

Frontend on port 5173

Access via http://localhost:5173


```
