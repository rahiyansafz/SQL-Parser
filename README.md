# AI-DB_Analyzer

A powerful tool for extracting and analyzing database schema from SQL dump files across multiple database dialects.

## Description

AI-DB_Analyzer is designed to parse SQL dump files from various database systems (MySQL, PostgreSQL, MS SQL Server, and SQLite), extract comprehensive schema information, and generate structured JSON representations that can be used for documentation, analysis, or as input for AI-driven database tools.

## Features

- **Multi-dialect Support**: Extracts schema from MySQL, PostgreSQL, MS SQL Server, and SQLite dump files
- **Comprehensive Schema Extraction**: Captures tables, columns, indexes, constraints, views, stored procedures, functions, triggers, and relationships
- **Direct Database Connections**: Can connect directly to live databases to extract schema information
- **MongoDB Support**: Also handles MongoDB schema extraction from BSON/JSON files
- **Intelligent Parsing**: Uses regex-based parsing with fallback mechanisms for robust extraction
- **JSON Output**: Generates structured JSON schema descriptions for easy consumption
- **Docker Support**: Can run in containerized environments for consistent execution

## Installation

### Standard Installation

```bash
# Clone the repository
git clone https://github.com/Techjays/AI-DB_Analyzer.git
cd AI-DB_Analyzer

# Install dependencies
npm install
```

### Docker Installation

```bash
# Clone the repository
git clone https://github.com/Techjays/AI-DB_Analyzer.git
cd AI-DB_Analyzer

# Build the Docker image
docker build -t ai-db-analyzer .

# Or using npm script
npm run docker:build
```

## Usage

### Analyzing SQL dump files

1. Place your SQL dump files in the `sql_files/` directory
2. Run the extraction script:

```bash
npm start
```

This will process all SQL files and generate corresponding JSON schema files in the `schema_results/` directory.

### Running with Docker

```bash
# Run with Docker directly
docker run -v "./sql_files:/app/sql_files" -v "./schema_results:/app/schema_results" ai-db-analyzer

# Or using npm script
npm run docker:start
```

### Running with Docker Compose

Docker Compose allows you to run the application along with database services for live connections:

```bash
# Start the application (and optionally database services)
docker-compose up

# Or using npm script
npm run docker:compose

# To rebuild and start
npm run docker:compose:build

# To stop all services
npm run docker:compose:down
```

To enable live database connections with Docker Compose, uncomment the desired database services in the `docker-compose.yml` file.

### Customizing the process

You can modify the `parseAllSchemas()` function in `index.js` to adjust which SQL files are processed:

```javascript
const dialects = [
    { file: './sql_files/postgres_dump.sql', type: 'postgres' },
    { file: './sql_files/sqlite_dump.sql', type: 'sqlite' },
    { file: './sql_files/mssql_dump.sql', type: 'mssql' },
    { file: './sql_files/mysql_dump.sql', type: 'mysql' }
];
```

### Connecting to live databases

The SchemaExtractionService also supports direct database connections. Example:

```javascript
const schemaExtractor = new SchemaExtractionService();
const schema = await schemaExtractor.extractSchemaFromConnection({
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    database: 'mydatabase',
    username: 'user',
    password: 'password'
});
```

When using Docker Compose, you can connect to the included database services using their service names as hostnames:

```javascript
const schema = await schemaExtractor.extractSchemaFromConnection({
    type: 'mysql',
    host: 'mysql',  // Use the service name from docker-compose.yml
    port: 3306,
    database: 'sampledb',
    username: 'root',
    password: 'rootpassword'
});
```

## Schema Structure

The generated schema JSON files contain detailed information about:

- **Tables**: Column definitions, data types, constraints, indexes
- **Views**: Definitions and source tables
- **Stored Procedures**: Parameters, body, and affected tables
- **Functions**: Return types, parameters, and logic
- **Triggers**: Timing (BEFORE, AFTER), events (INSERT, UPDATE, DELETE)
- **Relationships**: Foreign key relationships between tables

## LLM Integration

The schema can be formatted for use with Language Learning Models (LLMs) using the `formatSchemaForLLM()` function, which produces LLM-friendly descriptions of database objects.

## Project Structure

```
AI-DB_Analyzer/
│
├── index.js                  # Main entry point
├── schema_parser_service.js  # Core schema extraction logic
├── package.json              # Node.js dependencies
├── Dockerfile                # Docker configuration
├── docker-compose.yml        # Docker Compose configuration
│
├── sql_files/                # Directory for SQL dump files
│   ├── mssql_dump.sql
│   ├── mysql_dump.sql
│   ├── postgres_dump.sql
│   └── sqlite_dump.sql
│
└── schema_results/           # Output directory for JSON schemas
    ├── mssql_schema.json
    ├── mysql_schema.json
    ├── postgres_schema.json
    └── sqlite_schema.json
```

## Requirements

- Node.js 14.0 or higher
- NPM packages:
  - mongodb
  - mysql2
  - node-sql-parser
  - pg
- Docker and Docker Compose (for containerized execution)

## License

ISC

## Author

Rahiyan Safin

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.