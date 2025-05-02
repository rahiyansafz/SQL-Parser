import fs from 'fs/promises';
import path from 'path';
import SchemaExtractionService from './schema_parser_service.js';

const schemaExtractor = new SchemaExtractionService();

async function writeSchemaToFile(schema, dbType) {
    try {
        const outputPath = path.join(process.cwd(), 'schema_results', `${dbType}_schema.json`);
        await fs.writeFile(outputPath, JSON.stringify(schema, null, 2));
        console.log(`✅ Schema for ${dbType} written to ${outputPath}`);
    } catch (error) {
        console.error(`Error writing ${dbType} schema to file:`, error);
    }
}

async function parseAllSchemas() {
    const dialects = [
        { file: './sql_files/postgres_dump.sql', type: 'postgres' },
        { file: './sql_files/sqlite_dump.sql', type: 'sqlite' },
        { file: './sql_files/mssql_dump.sql', type: 'mssql' },
        { file: './sql_files/mysql_dump.sql', type: 'mysql' },
        { file: './sql_files/oracle_dump.sql', type: 'oracle' }
    ];

    for (const dialect of dialects) {
        try {
            console.log(`Processing ${dialect.type} schema...`);
            const schema = await schemaExtractor.parseSchemaFile(
                dialect.file,
                dialect.type
            );
            await writeSchemaToFile(schema, dialect.type);
        } catch (error) {
            console.error(`Failed to process ${dialect.type} schema:`, error);
        }
    }
}

parseAllSchemas();