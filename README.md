# CloudBrink Documentation Portal

A full-stack web application built with React (frontend), Node.js + Express
(backend), and PostgreSQL (database).

---

## Prerequisites

Before you begin, you need to install the following software on your computer:

### 1. Node.js (with npm)

- **Download from:** https://nodejs.org/en/download/
- Choose the **LTS version** (recommended)
- After installation, verify by running:
  ```bash
  node -v
  npm -v
  ```

### 2. PostgreSQL

- **Download from:** https://www.postgresql.org/download/
- During installation, remember:
  - Username: `postgres`
  - Password: (choose a strong password)
  - Port: `5432` (default)

### 3. Git

- **Download from:** https://git-scm.com/downloads
- After installation, verify by running:
  ```bash
  git --version
  ```

---

## Installation Steps

### Step 1: Clone the Repository

Open your terminal (Command Prompt on Windows, Terminal on Mac/Linux) and run:

```bash
git clone https://github.com/DheerajKommineni/CloudBrink.git
cd CloudBrink
```

---

### Step 2: Set Up PostgreSQL Database

#### 2.1 Open PostgreSQL Shell

**On Windows:**

1. Search "SQL Shell (psql)" in the Start Menu and open it
2. You'll see prompts:
   ```
   Server [localhost]:
   Database [postgres]:
   Port [5432]:
   Username [postgres]:
   Password for user postgres:
   ```
3. Press **Enter** for the first three prompts (server, database, port)
4. When asked for **Password**, enter the password you set during installation

**On Mac/Linux:**

1. Open Terminal and run:
   ```bash
   psql -U postgres
   ```
2. Enter your password when prompted

**If you forgot your password or never set one:**

Run these commands in your terminal:

**Windows (inside SQL Shell):**

```sql
ALTER USER postgres PASSWORD 'postgres123';
\q
```

**Mac/Linux:**

```bash
sudo -u postgres psql
```

Then inside psql:

```sql
ALTER USER postgres PASSWORD 'postgres123';
\q
```

Now you have:

- Username: `postgres`
- Password: `postgres123`

#### 2.2 Create the Database

Connect to PostgreSQL again with your password, then run:

```sql
CREATE DATABASE cloudbrink_docs;
\c cloudbrink_docs
```

You should see:
`You are now connected to database "cloudbrink_docs" as user "postgres".`

#### 2.3 Create Tables

Copy and paste these commands into the PostgreSQL shell:

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

-- Create index for better performance
CREATE INDEX idx_uploads_section ON uploads(section);

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

-- Create 'downloads' table
CREATE TABLE downloads (
  id SERIAL PRIMARY KEY,
  os_name VARCHAR(50),
  version VARCHAR(50),
  download_url TEXT,
  description TEXT,
  added_at TIMESTAMP DEFAULT NOW()
);

-- Insert sample download data
INSERT INTO downloads (os_name, version, download_url, description)
VALUES
  ('windows', '14.4.462', 'https://cloudbrink.com/brink-app-dl/BrinkAgent-latest.msi', 'Click below to download the latest Windows app'),
  ('mac', '14.4.462', 'https://cloudbrink.com/brink-app-dl/BrinkAgent-latest.pkg', 'Click below to download the latest Mac app'),
  ('ubuntu', '14.4.462 – 22.04', 'https://cloudbrink.com/brink-app-dl/BrinkAgent-latest.deb', 'Click below to download the latest Ubuntu app');
```

After running all commands, type `\q` to exit PostgreSQL shell.

---

### Step 3: Configure Environment Variables

You need to create configuration files for both backend and frontend.

#### 3.1 Backend Configuration

1. Navigate to the backend folder:

   ```bash
   cd backend
   ```

2. Create a file named `.env` (note the dot at the beginning)

3. Add the following content (replace `your_password` with your actual
   PostgreSQL password):

   ```env
   PGUSER=postgres
   PGPASSWORD=your_password
   PGDATABASE=cloudbrink_docs
   PGHOST=localhost
   PGPORT=5432
   PORT=5000
   ```

   If you used `postgres123` as password in Step 2:

   ```env
   PGUSER=postgres
   PGPASSWORD=postgres123
   PGDATABASE=cloudbrink_docs
   PGHOST=localhost
   PGPORT=5432
   PORT=5000
   ```

#### 3.2 Frontend Configuration

1. Navigate to the frontend folder:

   ```bash
   cd ../frontend
   ```

2. Create a file named `.env`

3. Add the following content:
   ```env
   VITE_API_BASE_URL=http://localhost:5000
   ```

---

### Step 4: Install Dependencies

#### 4.1 Install Backend Dependencies

```bash
cd backend
npm install
```

Wait for the installation to complete (this may take a few minutes).

#### 4.2 Install Frontend Dependencies

Open a **new terminal window** and run:

```bash
cd frontend
npm install
```

---

### Step 5: Run the Application

You need to run both backend and frontend servers simultaneously.

#### 5.1 Start the Backend Server

In the first terminal (in the `backend` folder):

```bash
npm run dev
```

You should see: `🚀 Server running on port 5000`

**Keep this terminal running!**

#### 5.2 Start the Frontend Server

In the second terminal (in the `frontend` folder):

```bash
npm run dev
```

You should see something like:

```
  VITE v... ready in ... ms

  ➜  Local:   http://localhost:5173/
```

**Keep this terminal running too!**

---

### Step 6: Access the Application

Open your web browser and go to:

```
http://localhost:5173
```

You should see the CloudBrink Documentation Portal!

---

## Troubleshooting

### Database Connection Issues

**Problem:** "Connection refused" or "password authentication failed"

**Solutions:**

1. Verify PostgreSQL is running:

   - Windows: Check Services → PostgreSQL should be running
   - Mac/Linux: Run `sudo service postgresql status`

2. Double-check your `.env` file in the backend folder
3. Verify the database exists:
   ```bash
   psql -U postgres -d cloudbrink_docs
   ```

### npm Install Errors

**Problem:** Errors during `npm install`

**Solution:**

```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Port Already in Use

**Problem:** "Port 5000 is already in use" or "Port 5173 is already in use"

**Solution:**

**On Mac/Linux:**

```bash
# Find process using the port
lsof -i :5000
lsof -i :5173

# Kill the process (replace <PID> with the actual process ID)
kill -9 <PID>
```

**On Windows:**

```bash
# Find process using the port
netstat -ano | findstr :5000
netstat -ano | findstr :5173

# Kill the process (replace <PID> with the actual process ID)
taskkill /PID <PID> /F
```

### Application Not Loading

**Problem:** Browser shows "Cannot connect" or blank page

**Solutions:**

1. Make sure **both** backend and frontend servers are running
2. Check the terminal for error messages
3. Verify URLs:
   - Backend: http://localhost:5000
   - Frontend: http://localhost:5173
4. Clear browser cache and refresh (Ctrl+Shift+R or Cmd+Shift+R)

---

## Building for Production

When you're ready to deploy the application:

```bash
cd frontend
npm run build
```

The production-ready files will be created in the `frontend/dist` folder.

---

## Quick Setup Checklist

Use this checklist to ensure everything is set up correctly:

- [ ] Node.js and npm installed and verified
- [ ] PostgreSQL installed and running
- [ ] Database `cloudbrink_docs` created
- [ ] All three tables created (`uploads`, `converted_files`, `downloads`)
- [ ] Sample data inserted into `downloads` table
- [ ] Backend `.env` file created with correct credentials
- [ ] Frontend `.env` file created
- [ ] Backend dependencies installed (`npm install` in backend folder)
- [ ] Frontend dependencies installed (`npm install` in frontend folder)
- [ ] Backend server running on port 5000
- [ ] Frontend server running on port 5173
- [ ] Application accessible at http://localhost:5173

---

## Project Structure

```
CloudBrink/
├── backend/
│   ├── node_modules/          # Backend dependencies (not in Git)
│   ├── routes/                # API routes
│   ├── utils/                 # Utility functions
│   ├── uploads/               # Uploaded PDF files
│   ├── converted/             # Converted markdown files
│   ├── .env                   # Backend configuration (create this)
│   ├── server.js              # Main backend file
│   ├── db.js                  # Database configuration
│   ├── package.json
│   └── ...
├── frontend/
│   ├── node_modules/          # Frontend dependencies (not in Git)
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── pages/             # Page components
│   │   └── ...
│   ├── .env                   # Frontend configuration (create this)
│   ├── package.json
│   └── ...
├── .gitignore                 # Files to ignore in Git
└── README.md                  # This file
```

---

## Need Help?

If you encounter any issues not covered in the troubleshooting section:

1. Check that all steps were completed in order
2. Verify all software versions are compatible
3. Look for error messages in the terminal
4. Make sure both backend and frontend servers are running

---

## Common Issues for First-Time Users

### "Command not found" errors

- Make sure you've installed Node.js and it's in your system PATH
- Restart your terminal after installing software

### PostgreSQL connection issues

- Verify PostgreSQL service is running
- Check username and password in `.env` file
- Ensure database `cloudbrink_docs` exists

### npm install taking too long

- This is normal for the first installation
- It may take 5-10 minutes depending on your internet speed

### Can't see the application in browser

- Wait for both servers to fully start
- Look for "ready" messages in both terminals
- Check for error messages in the terminals

---

## Important Notes

⚠️ **Security Notice:**

- The `.env` files contain sensitive information and are NOT included in the Git
  repository
- Never commit `.env` files to version control
- Each user must create their own `.env` files with their credentials

💡 **Tips:**

- Keep both terminal windows open while using the application
- Use `Ctrl+C` (or `Cmd+C` on Mac) to stop the servers when you're done
- The application uses `nodemon` which automatically restarts when you make code
  changes

---

**Happy coding! 🚀**
