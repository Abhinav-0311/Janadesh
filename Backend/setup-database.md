# Database Setup Guide

## Current Issue
The database connection is failing because PostgreSQL is not installed or running on your system.

## Quick Setup Options

### Option 1: Install PostgreSQL (Recommended)

1. **Download PostgreSQL**
   - Go to: https://www.postgresql.org/download/windows/
   - Download the latest version (15.x or 16.x)
   - Run the installer

2. **Installation Settings**
   - Use default port: 5432
   - Set password for `postgres` user (remember this!)
   - Install all components (including pgAdmin)

3. **Update Environment Variables**
   - Open `Backend/.env` file
   - Change `DB_PASSWORD=postgres` to your actual password
   - Example: `DB_PASSWORD=your_actual_password`

4. **Start PostgreSQL Service**
   - PostgreSQL should start automatically after installation
   - If not, go to Services (services.msc) and start "postgresql-x64-15"

### Option 2: Use Docker (Alternative)

1. **Install Docker Desktop**
   - Download from: https://www.docker.com/products/docker-desktop/
   - Install and restart your computer

2. **Run PostgreSQL Container**
   ```bash
   docker run --name voting-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=voting_platform -p 5432:5432 -d postgres:15
   ```

## Verify Installation

After installing PostgreSQL, run these commands in the Backend directory:

```bash
# Test database connection
npm run db:health

# Initialize database (create tables)
npm run db:init

# Check database status
npm run db:status
```

## Common Issues

1. **Port 5432 already in use**
   - Another PostgreSQL instance might be running
   - Change port in .env file or stop other instance

2. **Password authentication failed**
   - Check DB_PASSWORD in .env file
   - Make sure it matches your PostgreSQL password

3. **Database doesn't exist**
   - Run `npm run db:init` to create database and tables

## Test WebSocket with Database

Once PostgreSQL is running, you can test the full integration:

```bash
# Test with real database
npm test -- --testPathPattern=websocket-integration.test.ts

# Or start the full application
npm run dev
```

## Next Steps

1. Install PostgreSQL using Option 1 above
2. Update the password in `.env` file
3. Run `npm run db:health` to verify connection
4. Run `npm run db:init` to set up the database
5. Test the WebSocket functionality with real database connection