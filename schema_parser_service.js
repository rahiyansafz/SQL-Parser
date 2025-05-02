import { promises as fs } from 'fs';
import { MongoClient } from 'mongodb';
import { createConnection } from 'mysql2/promise';
import pkg from 'node-sql-parser';
import { Pool } from 'pg';
const { Parser } = pkg;

/**
 * Schema Extraction Service
 * Handles both file uploads and direct DB connections
 */
class SchemaExtractionService {
    constructor() {
        this.parser = new Parser();
    }

    /**
     * Parse SQL dump file
     * @param {string} filePath - Path to the SQL dump file
     * @param {string} dbType - 'mysql' or 'postgresql'
     * @returns {Object} Extracted schema metadata
     */
    async parseSchemaFile(filePath, dbType) {
        try {
            const content = await fs.readFile(filePath, 'utf8');

            if (dbType === 'mongodb') {
                return this.parseMongoDBSchema(content);
            } else {
                if (dbType === 'mysql' && content.includes('CREATE PROCEDURE')) {
                    return this.parseEnhancedMySQLSchema(content);
                } else {
                    return this.parseSQLSchema(content, dbType);
                }
            }
        } catch (error) {
            console.error('Error parsing schema file:', error);
            throw new Error(`Failed to parse schema file: ${error.message}`);
        }
    }

    /**
     * Parse MySQL schema with enhanced support for stored procedures, functions, and delimiters
     * @param {string} content - SQL dump content
     * @returns {Object} Extracted schema metadata
     */
    parseEnhancedMySQLSchema(content) {
        const schema = {
            tables: [],
            views: [],
            storedProcedures: [],
            functions: [],
            triggers: [],
            relationships: [],
        };

        try {
            let normalizedContent = this.normalizeMySQLDelimiters(content);

            this.extractTablesGeneric(normalizedContent, schema);
            this.extractViewsGeneric(normalizedContent, schema);
            this.extractTriggersGeneric(normalizedContent, schema);

            this.extractMySQLProcedures(content, schema);
            this.extractMySQLFunctions(content, schema);

            this.extractRelationshipsGeneric(schema);

            return schema;
        } catch (error) {
            console.error(`Error in enhanced MySQL parser: ${error.message}`);
            console.error(error.stack);

            console.log("Falling back to generic parser for MySQL...");
            return this.parseSQLSchema(content, 'mysql');
        }
    }

    /**
     * Normalize MySQL content by handling DELIMITER changes
     * @param {string} content - MySQL dump content with custom delimiters
     * @returns {string} Normalized content with standard delimiters
     */
    normalizeMySQLDelimiters(content) {
        const parts = content.split(/DELIMITER\s+([^\s]+)/i);

        if (parts.length <= 1) {
            return content;
        }

        let normalizedContent = parts[0];
        let currentDelimiter = ';';

        for (let i = 1; i < parts.length; i += 2) {
            if (i + 1 < parts.length) {
                currentDelimiter = parts[i].trim();
                let blockContent = parts[i + 1];

                const delimiterRegex = new RegExp(this.escapeRegExp(currentDelimiter), 'g');
                blockContent = blockContent.replace(delimiterRegex, ';');

                normalizedContent += blockContent;
            }
        }

        return normalizedContent;
    }

    /**
     * Escape special characters for use in RegExp
     * @param {string} string - String to escape
     * @returns {string} Escaped string
     */
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Extract MySQL stored procedures
     * @param {string} content - MySQL content
     * @param {Object} schema - Schema object to update
     */
    extractMySQLProcedures(content, schema) {
        const procPattern = /CREATE\s+(?:DEFINER\s*=\s*[^\s]+\s+)?PROCEDURE\s+`?(\w+)`?\s*\(([\s\S]*?)\)\s*(?:COMMENT\s+'([^']+)')?\s*(?:BEGIN|RETURN)([\s\S]*?)(?:END|DELIMITER\s*;)/gi;

        let match;
        while ((match = procPattern.exec(content)) !== null) {
            const procName = match[1];
            const paramsDef = match[2] || '';
            const comment = match[3] || '';
            const procBody = match[4] || '';

            const parameters = this.extractMySQLParameters(paramsDef);

            const affectedTables = this.extractTableReferencesFromSQL(procBody);

            schema.storedProcedures.push({
                name: procName,
                parameters: parameters,
                body: procBody.trim(),
                comment: comment,
                affectedTables: affectedTables
            });
        }
    }

    /**
     * Extract MySQL functions
     * @param {string} content - MySQL content
     * @param {Object} schema - Schema object to update
     */
    extractMySQLFunctions(content, schema) {
        const funcPattern = /CREATE\s+(?:DEFINER\s*=\s*[^\s]+\s+)?FUNCTION\s+`?(\w+)`?\s*\(([\s\S]*?)\)\s*RETURNS\s+(\w+(?:\([^)]+\))?)\s*(?:COMMENT\s+'([^']+)')?\s*(?:BEGIN|RETURN)([\s\S]*?)(?:END|DELIMITER\s*;)/gi;

        let match;
        while ((match = funcPattern.exec(content)) !== null) {
            const funcName = match[1];
            const paramsDef = match[2] || '';
            const returnType = match[3];
            const comment = match[4] || '';
            const funcBody = match[5] || '';

            const parameters = this.extractMySQLParameters(paramsDef);

            const affectedTables = this.extractTableReferencesFromSQL(funcBody);

            schema.functions.push({
                name: funcName,
                parameters: parameters,
                returnType: returnType,
                body: funcBody.trim(),
                comment: comment,
                affectedTables: affectedTables
            });
        }
    }

    /**
     * Extract parameters from MySQL parameter definition string
     * @param {string} paramsDef - Parameter definition string
     * @returns {Array} Array of parameter objects
     */
    extractMySQLParameters(paramsDef) {
        if (!paramsDef || !paramsDef.trim()) return [];

        const parameters = [];
        const paramList = paramsDef.split(',');

        for (const param of paramList) {
            const trimmedParam = param.trim();

            const paramMatch = trimmedParam.match(/(?:(IN|OUT|INOUT)\s+)?(\w+)\s+([^\s(]+(?:\([^)]*\))?)/i);

            if (paramMatch) {
                const direction = (paramMatch[1] || 'IN').toUpperCase();
                const name = paramMatch[2];
                const dataType = paramMatch[3];

                parameters.push({
                    name: name,
                    dataType: dataType,
                    direction: direction
                });
            }
        }

        return parameters;
    }

    /**
     * Parse SQL schema content with generic approach
     * @param {string} content - SQL dump content
     * @param {string} dbType - Database type ('mysql', 'postgresql', 'mssql', 'sqlite', etc.)
     * @returns {Object} Extracted schema metadata
     */
    parseSQLSchema(content, dbType) {
        const schema = {
            tables: [],
            views: [],
            storedProcedures: [],
            functions: [],
            triggers: [],
            relationships: [],
        };

        try {
            content = this.preProcessSQLContent(content, dbType);

            this.extractTablesGeneric(content, schema);
            this.extractViewsGeneric(content, schema);
            this.extractStoredProceduresGeneric(content, schema);
            this.extractFunctionsGeneric(content, schema);
            this.extractTriggersGeneric(content, schema);

            this.extractStandaloneIndexes(content, schema);

            this.extractRelationshipsGeneric(schema);

            return schema;
        } catch (error) {
            console.error(`Error in generic SQL parser: ${error.message}`);
            console.error(error.stack);

            console.log("Falling back to specific parser...");
            return this.fallbackParseSQLSchema(content, dbType);
        }
    }

    /**
     * Pre-process SQL content to normalize dialect-specific features
     * @param {string} content - SQL dump content 
     * @param {string} dbType - Database type
     * @returns {string} Normalized SQL content
     */
    preProcessSQLContent(content, dbType) {
        let processed = content.replace(/--.*$/gm, '');
        processed = processed.replace(/\/\*[\s\S]*?\*\//gm, '');

        if (dbType === 'mssql') {
            processed = processed.replace(/\bGO\b/gi, ';');
        }

        processed = processed.replace(/IDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, 'AUTO_INCREMENT');

        processed = processed.replace(/\bNULL\b/gi, 'NULL');
        processed = processed.replace(/\bNOT\s+NULL\b/gi, 'NOT NULL');

        processed = processed.replace(/\bNVARCHAR\b/gi, 'VARCHAR');
        processed = processed.replace(/\bNTEXT\b/gi, 'TEXT');
        processed = processed.replace(/\bNVARCHAR\s*\(\s*MAX\s*\)/gi, 'TEXT');
        processed = processed.replace(/\bVARCHAR\s*\(\s*MAX\s*\)/gi, 'TEXT');

        processed = processed.replace(/\bDATETIME2\b/gi, 'DATETIME');

        return processed;
    }

    /**
     * Extract tables using regex for cross-dialect compatibility
     * @param {string} content - SQL content
     * @param {Object} schema - Schema object to update
     */
    extractTablesGeneric(content, schema) {
        const tablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`|\[|")?(\w+)(?:`|\]|")?[\s\n]*\(([\s\S]*?)(?:\)[\s\n]*(?:;|$))/gi;

        let match;
        while ((match = tablePattern.exec(content)) !== null) {
            const tableName = match[1];
            const tableDefinition = match[2];

            const table = {
                name: tableName,
                columns: [],
                indexes: [],
                constraints: [],
            };

            this.extractColumnsGeneric(tableDefinition, table);

            this.extractConstraintsGeneric(tableDefinition, table);

            schema.tables.push(table);
        }

        this.extractAlterTableConstraints(content, schema);
    }

    /**
     * Extract columns from table definition
     * @param {string} tableDefinition - SQL table definition
     * @param {Object} table - Table object to update
     */
    extractColumnsGeneric(tableDefinition, table) {
        const columnLines = tableDefinition.split(',');

        for (let line of columnLines) {
            line = line.trim();

            if (!line ||
                line.toUpperCase().startsWith('PRIMARY KEY') ||
                line.toUpperCase().startsWith('FOREIGN KEY') ||
                line.toUpperCase().startsWith('CONSTRAINT') ||
                line.toUpperCase().startsWith('INDEX') ||
                line.toUpperCase().startsWith('UNIQUE')) {
                continue;
            }

            const columnPattern = /^(?:`|\[|")?(\w+)(?:`|\]|")?\s+(\w+(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)\s*(.*?)$/i;
            const columnMatch = line.match(columnPattern);

            if (columnMatch) {
                const name = columnMatch[1];
                const dataType = columnMatch[2].toUpperCase();
                const rest = columnMatch[3] || '';

                const column = {
                    name,
                    dataType,
                    nullable: !rest.toUpperCase().includes('NOT NULL'),
                    defaultValue: this.extractDefaultValue(rest),
                    autoIncrement: rest.toUpperCase().includes('AUTO_INCREMENT') ||
                        rest.toUpperCase().includes('IDENTITY') ||
                        rest.toUpperCase().includes('SERIAL'),
                    comment: this.extractComment(rest),
                };

                table.columns.push(column);
            }
        }
    }

    /**
     * Extract default value from column definition
     * @param {string} columnDef - Column definition
     * @returns {any} Default value
     */
    extractDefaultValue(columnDef) {
        const defaultPattern = /DEFAULT\s+(?:'([^']*)'|(\d+(?:\.\d+)?)|(\w+)|\(([^)]+)\))/i;
        const match = columnDef.match(defaultPattern);

        if (match) {
            if (match[1] !== undefined) return match[1];
            if (match[2] !== undefined) return Number(match[2]);
            if (match[3] !== undefined) return match[3];
            if (match[4] !== undefined) return match[4];
        }

        return null;
    }

    /**
     * Extract comment from column definition
     * @param {string} columnDef - Column definition
     * @returns {string} Comment text
     */
    extractComment(columnDef) {
        const commentPattern = /COMMENT\s+'([^']*)'/i;
        const match = columnDef.match(commentPattern);

        return match ? match[1] : '';
    }

    /**
     * Extract constraints from table definition
     * @param {string} tableDefinition - SQL table definition
     * @param {Object} table - Table object to update
     */
    extractConstraintsGeneric(tableDefinition, table) {
        const pkPattern = /PRIMARY\s+KEY\s*\(([^)]+)\)/gi;
        let pkMatch;
        while ((pkMatch = pkPattern.exec(tableDefinition)) !== null) {
            const columns = pkMatch[1].split(',').map(col => col.trim().replace(/^[`"\[]|[`"\]]$/g, ''));

            table.constraints.push({
                type: 'PRIMARY KEY',
                name: `PK_${table.name}`,
                columns: columns
            });
        }

        const fkPattern = /FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s*\(([^)]+)\)/gi;
        let fkMatch;
        while ((fkMatch = fkPattern.exec(tableDefinition)) !== null) {
            const columns = fkMatch[1].split(',').map(col => col.trim().replace(/^[`"\[]|[`"\]]$/g, ''));
            const refTable = fkMatch[2];
            const refColumns = fkMatch[3].split(',').map(col => col.trim().replace(/^[`"\[]|[`"\]]$/g, ''));

            table.constraints.push({
                type: 'FOREIGN KEY',
                name: `FK_${table.name}_${refTable}`,
                columns: columns,
                references: {
                    table: refTable,
                    columns: refColumns
                }
            });
        }

        const uniquePattern = /UNIQUE\s*(?:KEY|INDEX)?\s*(?:`|\[|")?(\w+)?(?:`|\]|")?\s*\(([^)]+)\)/gi;
        let uniqueMatch;
        while ((uniqueMatch = uniquePattern.exec(tableDefinition)) !== null) {
            const name = uniqueMatch[1] || `UQ_${table.name}_${uniqueMatch[2].replace(/[^a-zA-Z0-9]/g, '')}`;
            const columns = uniqueMatch[2].split(',').map(col => col.trim().replace(/^[`"\[]|[`"\]]$/g, ''));

            table.indexes.push({
                name: name,
                columns: columns.map(col => ({ name: col })),
                unique: true
            });
        }

        const checkPatterns = [
            /CONSTRAINT\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s+CHECK\s*\(([^)]+)\)/gi,
            /CHECK\s*\(([^)]+)\)/gi
        ];

        for (const pattern of checkPatterns) {
            let checkMatch;
            while ((checkMatch = pattern.exec(tableDefinition)) !== null) {
                const name = checkMatch[1] || `CK_${table.name}_${table.constraints.length + 1}`;
                const expression = checkMatch[2] || checkMatch[1];

                table.constraints.push({
                    type: 'CHECK',
                    name: name,
                    expression: expression.trim()
                });
            }
        }
    }

    /**
     * Extract constraints from ALTER TABLE statements
     * @param {string} content - SQL content
     * @param {Object} schema - Schema object to update
     */
    extractAlterTableConstraints(content, schema) {
        const alterPattern = /ALTER\s+TABLE\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s+ADD\s+(?:CONSTRAINT\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s+)?(\w+\s+\w+)\s*\(([^)]+)\)(?:\s+REFERENCES\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s*\(([^)]+)\))?/gi;

        let match;
        while ((match = alterPattern.exec(content)) !== null) {
            const tableName = match[1];
            const constraintName = match[2] || '';
            const constraintType = match[3].toUpperCase();
            const columns = match[4].split(',').map(col => col.trim().replace(/^[`"\[]|[`"\]]$/g, ''));

            const table = schema.tables.find(t => t.name.toUpperCase() === tableName.toUpperCase());
            if (!table) continue;

            if (constraintType.includes('FOREIGN KEY') && match[5]) {
                const refTable = match[5];
                const refColumns = match[6].split(',').map(col => col.trim().replace(/^[`"\[]|[`"\]]$/g, ''));

                table.constraints.push({
                    type: 'FOREIGN KEY',
                    name: constraintName || `FK_${tableName}_${refTable}`,
                    columns: columns,
                    references: {
                        table: refTable,
                        columns: refColumns
                    }
                });
            } else if (constraintType.includes('PRIMARY KEY')) {
                table.constraints.push({
                    type: 'PRIMARY KEY',
                    name: constraintName || `PK_${tableName}`,
                    columns: columns
                });
            } else if (constraintType.includes('UNIQUE')) {
                table.indexes.push({
                    name: constraintName || `UQ_${tableName}_${columns.join('_')}`,
                    columns: columns.map(col => ({ name: col })),
                    unique: true
                });
            }
        }
    }

    /**
     * Extract standalone CREATE INDEX statements
     * @param {string} content - SQL content
     * @param {Object} schema - Schema object to update
     */
    extractStandaloneIndexes(content, schema) {
        const indexPatterns = [
            /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s+ON\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s*\(([^)]+)\)/gi,
            /CREATE\s+(?:UNIQUE\s+)?(?:NONCLUSTERED\s+)?INDEX\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s+ON\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s*\(([^)]+)\)/gi,
            /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s+ON\s+(?:`|\[|")?(\w+)(?:`|\]|")?[\s\n]*\(([^)]+)\)/gi
        ];

        for (const pattern of indexPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const indexName = match[1];
                const tableName = match[2];
                const columnDef = match[3];
                const isUnique = match[0].toUpperCase().includes('UNIQUE');

                const columns = columnDef.split(',').map(col => {
                    const parts = col.trim().replace(/^[`"\[]|[`"\]]$/g, '').split(/\s+/);
                    return {
                        name: parts[0],
                        order: parts[1] ? parts[1].toUpperCase() : 'ASC'
                    };
                });

                const table = schema.tables.find(t =>
                    t.name.toUpperCase() === tableName.toUpperCase()
                );

                if (table) {
                    const existingIndex = table.indexes.find(idx =>
                        idx.name.toUpperCase() === indexName.toUpperCase()
                    );

                    if (!existingIndex) {
                        table.indexes.push({
                            name: indexName,
                            columns: columns,
                            unique: isUnique
                        });
                    }
                }
            }
        }
    }

    /**
     * Extract views using regex
     * @param {string} content - SQL content
     * @param {Object} schema - Schema object to update
     */
    extractViewsGeneric(content, schema) {
        const viewPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s+AS\s+([\s\S]*?)(?:;|GO|$)/gi;

        let match;
        while ((match = viewPattern.exec(content)) !== null) {
            const viewName = match[1];
            const viewDefinition = match[2].trim();

            const sourceTables = this.extractTableReferencesFromSQL(viewDefinition);

            schema.views.push({
                name: viewName,
                definition: viewDefinition,
                sourceTables: sourceTables
            });
        }
    }

    /**
     * Extract stored procedures using regex
     * @param {string} content - SQL content
     * @param {Object} schema - Schema object to update
     */
    extractStoredProceduresGeneric(content, schema) {
        const procPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|PROC)\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s*(?:\(([\s\S]*?)\))?\s*(?:AS|IS|BEGIN)?\s*([\s\S]*?)(?:END;|END|GO|\/|;|$)/gi;

        let match;
        while ((match = procPattern.exec(content)) !== null) {
            const procName = match[1];
            const paramsDef = match[2] || '';
            const procBody = match[3] || '';

            const parameters = this.extractParametersGeneric(paramsDef);

            const affectedTables = this.extractTableReferencesFromSQL(procBody);

            schema.storedProcedures.push({
                name: procName,
                parameters: parameters,
                body: procBody.trim(),
                affectedTables: affectedTables
            });
        }
    }

    /**
     * Extract functions using regex
     * @param {string} content - SQL content
     * @param {Object} schema - Schema object to update
     */
    extractFunctionsGeneric(content, schema) {
        const funcPatterns = [
            /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s*(?:\(([\s\S]*?)\))?\s*RETURNS\s+(\w+(?:\([^)]+\))?)\s*(?:AS|IS|BEGIN)?\s*([\s\S]*?)(?:END;|END|GO|\/|;|$)/gi,

            /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s*(?:\(([\s\S]*?)\))?\s*RETURNS\s+(\w+(?:\([^)]+\))?)\s*(?:LANGUAGE\s+\w+)?\s*(?:AS\s*[$][$]|IS|BEGIN)([\s\S]*?)(?:[$][$]|END;|END|GO|\/|;|$)/gi,

            /CREATE\s+(?:DEFINER\s*=\s*[^\s]+\s+)?FUNCTION\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s*\(([\s\S]*?)\)\s*RETURNS\s+(\w+(?:\([^)]+\))?)([\s\S]*?)(?:END|DELIMITER\s*;)/gi
        ];

        for (const pattern of funcPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const funcName = match[1];
                const paramsDef = match[2] || '';
                const returnType = match[3];
                const funcBody = match[4] || '';

                if (schema.functions.some(f => f.name === funcName)) {
                    continue;
                }

                const parameters = this.extractParametersGeneric(paramsDef);

                const affectedTables = this.extractTableReferencesFromSQL(funcBody);

                schema.functions.push({
                    name: funcName,
                    parameters: parameters,
                    returnType: returnType,
                    body: funcBody.trim(),
                    affectedTables: affectedTables
                });
            }
        }
    }

    /**
     * Extract triggers using regex
     * @param {string} content - SQL content
     * @param {Object} schema - Schema object to update
     */
    extractTriggersGeneric(content, schema) {
        const triggerPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+(?:`|\[|")?(\w+)(?:`|\]|")?\s+(?:(BEFORE|AFTER|INSTEAD\s+OF)\s+)?(INSERT|UPDATE|DELETE)(?:\s+(?:ON|OF)\s+)?(?:`|\[|")?(\w+)(?:`|\]|")?\s*([\s\S]*?)(?:END;|END|GO|\/|;|$)/gi;

        let match;
        while ((match = triggerPattern.exec(content)) !== null) {
            const triggerName = match[1];
            const timing = (match[2] || 'AFTER').toUpperCase().replace(/\s+OF/, '');
            const event = match[3].toUpperCase();
            const tableName = match[4];
            const triggerBody = match[5] || '';

            const affectedTables = this.extractTableReferencesFromSQL(triggerBody);

            schema.triggers.push({
                name: triggerName,
                table: tableName,
                timing: timing,
                events: [event],
                body: triggerBody.trim(),
                affectedTables: affectedTables
            });
        }
    }

    /**
     * Extract parameters from a parameter definition string
     * @param {string} paramsDef - Parameter definition string
     * @returns {Array} Array of parameter objects
     */
    extractParametersGeneric(paramsDef) {
        if (!paramsDef.trim()) return [];

        const parameters = [];
        const paramList = paramsDef.split(',');

        for (const param of paramList) {
            const trimmedParam = param.trim();

            let paramName, paramType, direction = 'IN';

            const mssqlMatch = trimmedParam.match(/@(\w+)\s+([^\s=]+)(?:\s*=\s*(.+))?/i);
            if (mssqlMatch) {
                paramName = mssqlMatch[1];
                paramType = mssqlMatch[2];
                if (trimmedParam.toUpperCase().includes('OUTPUT')) {
                    direction = 'OUT';
                }
            }
            else {
                const dirMatch = trimmedParam.match(/^(IN|OUT|INOUT)?\s*(\w+)\s+(.+)$/i);
                if (dirMatch) {
                    direction = (dirMatch[1] || 'IN').toUpperCase();
                    paramName = dirMatch[2];
                    paramType = dirMatch[3];
                } else {
                    const simpleMatch = trimmedParam.match(/^(\w+)\s+(.+)$/i);
                    if (simpleMatch) {
                        paramName = simpleMatch[1];
                        paramType = simpleMatch[2];
                    }
                }
            }

            if (paramName && paramType) {
                parameters.push({
                    name: paramName,
                    dataType: paramType,
                    direction: direction
                });
            }
        }

        return parameters;
    }

    /**
     * Extract table references from SQL code
     * @param {string} sql - SQL code to analyze
     * @returns {Array<string>} List of table names referenced
     */
    extractTableReferencesFromSQL(sql) {
        if (!sql) return [];

        const tables = new Set();

        const patterns = [
            /\bFROM\s+(?:`|\[|")?(\w+)(?:`|\]|")?(?:\s+(?:AS\s+)?(\w+))?/gi,
            /\bJOIN\s+(?:`|\[|")?(\w+)(?:`|\]|")?(?:\s+(?:AS\s+)?(\w+))?/gi,
            /\bINTO\s+(?:`|\[|")?(\w+)(?:`|\]|")?/gi,
            /\bUPDATE\s+(?:`|\[|")?(\w+)(?:`|\]|")?(?:\s+(?:AS\s+)?(\w+))?/gi,
            /\bINSERT\s+INTO\s+(?:`|\[|")?(\w+)(?:`|\]|")?/gi,
            /\bDELETE\s+FROM\s+(?:`|\[|")?(\w+)(?:`|\]|")?(?:\s+(?:AS\s+)?(\w+))?/gi,
            /\bALTER\s+TABLE\s+(?:`|\[|")?(\w+)(?:`|\]|")?/gi,

            /\bCREATE(?:\s+OR\s+REPLACE)?\s+(?:MATERIALIZED\s+)?VIEW\s+(?:`|\[|")?(?:\w+)(?:`|\]|")?\s+AS[\s\S]*?\bFROM\s+(?:`|\[|")?(\w+)(?:`|\]|")?/gi,
            /\bMERGE\s+(?:INTO\s+)?(?:`|\[|")?(\w+)(?:`|\]|")?/gi,
            /\bUSING\s+(?:`|\[|")?(\w+)(?:`|\]|")?/gi
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(sql)) !== null) {
                const tableName = match[1];

                const skipKeywords = ['SELECT', 'WHERE', 'HAVING', 'GROUP', 'ORDER', 'UNION',
                    'BY', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'AS', 'IN', 'IS', 'IF',
                    'EXISTS', 'ALL', 'ANY', 'SOME', 'CASE', 'WHEN', 'THEN', 'ELSE'];

                if (tableName && !skipKeywords.includes(tableName.toUpperCase())) {
                    tables.add(tableName);
                }
            }
        }

        if (sql.match(/\bINSERTED\b/i)) tables.add('inserted');
        if (sql.match(/\bDELETED\b/i)) tables.add('deleted');

        if (sql.match(/\bNEW\b/i) && sql.match(/\bTRIGGER\b/i)) tables.add('NEW');
        if (sql.match(/\bOLD\b/i) && sql.match(/\bTRIGGER\b/i)) tables.add('OLD');

        return Array.from(tables);
    }

    /**
     * Extract affected tables from a SQL statement
     * This is a wrapper around extractTableReferencesFromSQL for compatibility
     * @param {string} sql - SQL statement
     * @returns {Array<string>} List of affected tables
     */
    extractAffectedTables(sql) {
        return this.extractTableReferencesFromSQL(sql);
    }

    /**
     * Extract relationships between tables from constraints
     * @param {Object} schema - Schema object to analyze
     */
    extractRelationshipsGeneric(schema) {
        for (const table of schema.tables) {
            const foreignKeys = table.constraints.filter(c =>
                c.type.toUpperCase() === 'FOREIGN KEY' && c.references);

            for (const fk of foreignKeys) {
                schema.relationships.push({
                    fromTable: table.name,
                    fromColumns: fk.columns,
                    toTable: fk.references.table,
                    toColumns: fk.references.columns,
                    name: fk.name || `FK_${table.name}_${fk.references.table}`
                });
            }
        }
    }

    /**
     * Extract relationships from foreign keys
     * Compatibility method for direct database connections
     * @param {Object} schema - Schema object
     */
    extractRelationships(schema) {
        this.extractRelationshipsGeneric(schema);
    }

    /**
     * Fallback to dialect-specific parser if generic parser fails
     * @param {string} content - SQL content
     * @param {string} dbType - Database type
     * @returns {Object} Schema object
     */
    fallbackParseSQLSchema(content, dbType) {
        console.log(`Using fallback parser for ${dbType}...`);

        const schema = {
            tables: [],
            views: [],
            storedProcedures: [],
            functions: [],
            triggers: [],
            relationships: [],
        };

        try {
            this.extractViewsGeneric(content, schema);
            this.extractStoredProceduresGeneric(content, schema);
            this.extractFunctionsGeneric(content, schema);
            this.extractTriggersGeneric(content, schema);
        } catch (error) {
            console.error(`Fallback parser also failed: ${error.message}`);
        }

        return schema;
    }

    /**
     * Parse MongoDB schema (from BSON/JSON files)
     * @param {string} content - MongoDB schema content
     * @returns {Object} Extracted schema metadata
     */
    parseMongoDBSchema(content) {
        try {
            const jsonContent = JSON.parse(content);
            const schema = {
                collections: [],
                indexes: [],
                validationRules: [],
            };

            if (Array.isArray(jsonContent)) {
                this.extractMongoCollectionsFromDocs(jsonContent, schema);
            } else if (jsonContent.collections) {
                this.extractMongoCollectionsFromDump(jsonContent, schema);
            } else {
                console.warn(
                    'Unknown MongoDB schema format, trying best-effort extraction'
                );
                this.extractMongoSchema(jsonContent, schema);
            }

            return schema;
        } catch (error) {
            console.error('Error parsing MongoDB schema:', error);
            throw new Error(`Failed to parse MongoDB schema: ${error.message}`);
        }
    }

    /**
     * Extract MongoDB collections from document array
     * @param {Array} documents - Array of MongoDB documents
     * @param {Object} schema - Schema object to update
     */
    extractMongoCollectionsFromDocs(documents, schema) {
        const fieldTypes = {};
        const collections = new Set();

        for (const doc of documents) {
            if (doc._id && doc.ns) {
                collections.add(doc.ns.split('.')[1]);
            } else if (doc._id) {
                const collectionName = 'unknown';
                if (!fieldTypes[collectionName]) {
                    fieldTypes[collectionName] = {};
                }

                this.extractMongoDocumentFields(doc, fieldTypes[collectionName]);
            }
        }

        for (const collectionName of collections) {
            schema.collections.push({
                name: collectionName,
                fields: fieldTypes[collectionName] || {},
            });
        }
    }

    /**
     * Extract MongoDB collections from dump format
     * @param {Object} dump - MongoDB dump object
     * @param {Object} schema - Schema object to update
     */
    extractMongoCollectionsFromDump(dump, schema) {
        for (const collection of dump.collections) {
            const collectionSchema = {
                name: collection.name,
                fields: {},
                indexes: [],
            };

            if (collection.indexes) {
                for (const index of collection.indexes) {
                    collectionSchema.indexes.push({
                        name: index.name,
                        key: index.key,
                        unique: index.unique || false,
                    });

                    schema.indexes.push({
                        collection: collection.name,
                        name: index.name,
                        key: index.key,
                        unique: index.unique || false,
                    });
                }
            }

            if (collection.options && collection.options.validator) {
                collectionSchema.validator = collection.options.validator;

                schema.validationRules.push({
                    collection: collection.name,
                    validator: collection.options.validator,
                });
            }

            if (collection.documents && collection.documents.length > 0) {
                for (const doc of collection.documents) {
                    this.extractMongoDocumentFields(doc, collectionSchema.fields);
                }
            }

            schema.collections.push(collectionSchema);
        }
    }

    /**
     * Extract field types from a MongoDB document
     * @param {Object} doc - MongoDB document
     * @param {Object} fields - Fields object to update
     * @param {string} prefix - Field path prefix for nested fields
     */
    extractMongoDocumentFields(doc, fields, prefix = '') {
        for (const [key, value] of Object.entries(doc)) {
            if (key === '_id') continue;

            const fieldPath = prefix ? `${prefix}.${key}` : key;

            if (value === null) {
                fields[fieldPath] = 'null';
            } else if (Array.isArray(value)) {
                fields[fieldPath] = 'array';

                if (value.length > 0) {
                    if (typeof value[0] === 'object' && value[0] !== null) {
                        this.extractMongoDocumentFields(value[0], fields, `${fieldPath}[]`);
                    } else {
                        fields[`${fieldPath}[]`] = typeof value[0];
                    }
                }
            } else if (typeof value === 'object') {
                fields[fieldPath] = 'object';
                this.extractMongoDocumentFields(value, fields, fieldPath);
            } else {
                fields[fieldPath] = typeof value;
            }
        }
    }

    /**
     * Extract MongoDB schema from a generic object
     * @param {Object} obj - MongoDB schema object
     * @param {Object} schema - Schema object to update
     */
    extractMongoSchema(obj, schema) {
        if (obj.collections) {
            for (const collection of obj.collections) {
                schema.collections.push({
                    name: collection.name || 'unknown',
                    fields: collection.fields || {},
                });
            }
        } else if (obj.tables) {
            for (const table of obj.tables) {
                schema.collections.push({
                    name: table.name || 'unknown',
                    fields: table.fields || {},
                });
            }
        } else {
            schema.collections.push({
                name: obj.name || 'unknown',
                fields: {},
            });

            this.extractMongoDocumentFields(obj, schema.collections[0].fields);
        }
    }

    /**
     * Extract schema directly from a connected database
     * @param {Object} connectionConfig - Database connection configuration
     * @returns {Promise<Object>} Extracted schema metadata
     */
    async extractSchemaFromConnection(connectionConfig) {
        try {
            const { type, host, port, database, username, password } =
                connectionConfig;

            switch (type.toLowerCase()) {
                case 'mysql':
                    return await this.extractMySQLSchema(
                        host,
                        port,
                        database,
                        username,
                        password
                    );
                case 'postgresql':
                    return await this.extractPostgresSchema(
                        host,
                        port,
                        database,
                        username,
                        password
                    );
                case 'mongodb':
                    return await this.extractMongoDBSchemaFromConnection(
                        host,
                        port,
                        database,
                        username,
                        password
                    );
                default:
                    throw new Error(`Unsupported database type: ${type}`);
            }
        } catch (error) {
            console.error('Error extracting schema from connection:', error);
            throw new Error(`Failed to extract schema: ${error.message}`);
        }
    }

    /**
     * Extract schema from MySQL database connection
     * @param {string} host - Database host
     * @param {number} port - Database port
     * @param {string} database - Database name
     * @param {string} username - Database username
     * @param {string} password - Database password
     * @returns {Promise<Object>} Extracted schema metadata
     */
    async extractMySQLSchema(host, port, database, username, password) {
        const connection = await createConnection({
            host,
            port: port || 3306,
            user: username,
            password,
            database,
        });

        try {
            const schema = {
                tables: [],
                views: [],
                storedProcedures: [],
                functions: [],
                triggers: [],
                relationships: [],
            };

            const [tables] = await connection.query(
                `
        SELECT TABLE_NAME, TABLE_COMMENT
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      `,
                [database]
            );

            for (const table of tables) {
                const tableName = table.TABLE_NAME;
                const tableObj = {
                    name: tableName,
                    comment: table.TABLE_COMMENT,
                    columns: [],
                    indexes: [],
                    constraints: [],
                };

                const [columns] = await connection.query(
                    `
          SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, 
                 EXTRA, COLUMN_COMMENT
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `,
                    [database, tableName]
                );

                for (const column of columns) {
                    tableObj.columns.push({
                        name: column.COLUMN_NAME,
                        dataType: column.DATA_TYPE,
                        columnType: column.COLUMN_TYPE,
                        nullable: column.IS_NULLABLE === 'YES',
                        defaultValue: column.COLUMN_DEFAULT,
                        extra: column.EXTRA,
                        comment: column.COLUMN_COMMENT,
                    });
                }

                const [indexes] = await connection.query(`
          SHOW INDEX FROM \`${tableName}\`
        `);

                const indexMap = {};
                for (const index of indexes) {
                    const indexName = index.Key_name;
                    if (!indexMap[indexName]) {
                        indexMap[indexName] = {
                            name: indexName,
                            columns: [],
                            unique: index.Non_unique === 0,
                            type: index.Index_type,
                        };
                    }

                    indexMap[indexName].columns.push({
                        name: index.Column_name,
                        order: index.Seq_in_index,
                    });
                }

                tableObj.indexes = Object.values(indexMap);

                const [foreignKeys] = await connection.query(
                    `
          SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
        `,
                    [database, tableName]
                );

                const fkMap = {};
                for (const fk of foreignKeys) {
                    const constraintName = fk.CONSTRAINT_NAME;
                    if (!fkMap[constraintName]) {
                        fkMap[constraintName] = {
                            name: constraintName,
                            type: 'FOREIGN KEY',
                            columns: [],
                            references: {
                                table: fk.REFERENCED_TABLE_NAME,
                                columns: [],
                            },
                        };
                    }

                    fkMap[constraintName].columns.push(fk.COLUMN_NAME);
                    fkMap[constraintName].references.columns.push(
                        fk.REFERENCED_COLUMN_NAME
                    );
                }

                tableObj.constraints = Object.values(fkMap);

                const primaryKey = tableObj.indexes.find(
                    (idx) => idx.name === 'PRIMARY'
                );
                if (primaryKey) {
                    tableObj.constraints.push({
                        name: 'PRIMARY',
                        type: 'PRIMARY KEY',
                        columns: primaryKey.columns.map((col) => col.name),
                    });
                }

                schema.tables.push(tableObj);
            }

            const [views] = await connection.query(
                `
        SELECT TABLE_NAME, VIEW_DEFINITION
        FROM INFORMATION_SCHEMA.VIEWS
        WHERE TABLE_SCHEMA = ?
      `,
                [database]
            );

            for (const view of views) {
                schema.views.push({
                    name: view.TABLE_NAME,
                    definition: view.VIEW_DEFINITION,
                });
            }

            const [procedures] = await connection.query(
                `
        SELECT ROUTINE_NAME, ROUTINE_DEFINITION, ROUTINE_COMMENT
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'
      `,
                [database]
            );

            for (const procedure of procedures) {
                const procName = procedure.ROUTINE_NAME;

                const [params] = await connection.query(
                    `
          SELECT PARAMETER_NAME, PARAMETER_MODE, DATA_TYPE
          FROM INFORMATION_SCHEMA.PARAMETERS
          WHERE SPECIFIC_SCHEMA = ? AND SPECIFIC_NAME = ?
          ORDER BY ORDINAL_POSITION
        `,
                    [database, procName]
                );

                const procedureObj = {
                    name: procName,
                    parameters: params.map((p) => ({
                        name: p.PARAMETER_NAME,
                        direction: p.PARAMETER_MODE,
                        dataType: p.DATA_TYPE,
                    })),
                    body: procedure.ROUTINE_DEFINITION,
                    comment: procedure.ROUTINE_COMMENT,
                    affectedTables: this.extractAffectedTables(
                        procedure.ROUTINE_DEFINITION
                    ),
                };

                schema.storedProcedures.push(procedureObj);
            }

            const [functions] = await connection.query(
                `
        SELECT ROUTINE_NAME, ROUTINE_DEFINITION, ROUTINE_COMMENT, DTD_IDENTIFIER
        FROM INFORMATION_SCHEMA.ROUTINES
        WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION'
      `,
                [database]
            );

            for (const func of functions) {
                const funcName = func.ROUTINE_NAME;

                const [params] = await connection.query(
                    `
          SELECT PARAMETER_NAME, PARAMETER_MODE, DATA_TYPE
          FROM INFORMATION_SCHEMA.PARAMETERS
          WHERE SPECIFIC_SCHEMA = ? AND SPECIFIC_NAME = ? AND PARAMETER_NAME IS NOT NULL
          ORDER BY ORDINAL_POSITION
        `,
                    [database, funcName]
                );

                const functionObj = {
                    name: funcName,
                    parameters: params.map((p) => ({
                        name: p.PARAMETER_NAME,
                        direction: p.PARAMETER_MODE,
                        dataType: p.DATA_TYPE,
                    })),
                    returnType: func.DTD_IDENTIFIER,
                    body: func.ROUTINE_DEFINITION,
                    comment: func.ROUTINE_COMMENT,
                    affectedTables: this.extractAffectedTables(func.ROUTINE_DEFINITION),
                };

                schema.functions.push(functionObj);
            }

            const [triggers] = await connection.query(
                `
        SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING, EVENT_OBJECT_TABLE, ACTION_STATEMENT
        FROM INFORMATION_SCHEMA.TRIGGERS
        WHERE TRIGGER_SCHEMA = ?
      `,
                [database]
            );

            for (const trigger of triggers) {
                const triggerObj = {
                    name: trigger.TRIGGER_NAME,
                    event: trigger.EVENT_MANIPULATION,
                    timing: trigger.ACTION_TIMING,
                    table: trigger.EVENT_OBJECT_TABLE,
                    body: trigger.ACTION_STATEMENT,
                    affectedTables: this.extractAffectedTables(trigger.ACTION_STATEMENT),
                };

                schema.triggers.push(triggerObj);
            }

            this.extractRelationships(schema);

            return schema;
        } finally {
            await connection.end();
        }
    }

    /**
     * Extract schema from PostgreSQL database connection
     * @param {string} host - Database host
     * @param {number} port - Database port
     * @param {string} database - Database name
     * @param {string} username - Database username
     * @param {string} password - Database password
     * @returns {Promise<Object>} Extracted schema metadata
     */
    async extractPostgresSchema(host, port, database, username, password) {
        const pool = new Pool({
            host,
            port: port || 5432,
            database,
            user: username,
            password,
        });

        try {
            const schema = {
                tables: [],
                views: [],
                storedProcedures: [],
                functions: [],
                triggers: [],
                relationships: [],
            };

            const tables = await pool.query(`
        SELECT table_name, obj_description(pgc.oid, 'pg_class') as table_comment
        FROM pg_tables t
        JOIN pg_class pgc ON pgc.relname = t.tablename
        WHERE t.schemaname = 'public'
      `);

            for (const table of tables.rows) {
                const tableName = table.table_name;
                const tableObj = {
                    name: tableName,
                    comment: table.table_comment,
                    columns: [],
                    indexes: [],
                    constraints: [],
                };

                const columns = await pool.query(
                    `
          SELECT column_name, data_type, is_nullable, column_default,
                 pg_catalog.col_description(format('%s.%s',table_schema,table_name)::regclass::oid,ordinal_position) as column_comment
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `,
                    [tableName]
                );

                for (const column of columns.rows) {
                    tableObj.columns.push({
                        name: column.column_name,
                        dataType: column.data_type,
                        nullable: column.is_nullable === 'YES',
                        defaultValue: column.column_default,
                        comment: column.column_comment,
                    });
                }

                const indexes = await pool.query(
                    `
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = $1
        `,
                    [tableName]
                );

                for (const index of indexes.rows) {
                    const indexDef = index.indexdef;
                    const unique = indexDef.includes('UNIQUE');

                    const columnMatch = indexDef.match(/\(([^)]+)\)/);
                    const columns = columnMatch
                        ? columnMatch[1].split(',').map((c) => c.trim())
                        : [];

                    tableObj.indexes.push({
                        name: index.indexname,
                        unique,
                        columns: columns.map((col) => ({ name: col })),
                    });

                    if (index.indexname.endsWith('_pkey')) {
                        tableObj.constraints.push({
                            name: index.indexname,
                            type: 'PRIMARY KEY',
                            columns,
                        });
                    }
                }

                const foreignKeys = await pool.query(
                    `
          SELECT
            tc.constraint_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
          FROM
            information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
            AND tc.table_name = $1
        `,
                    [tableName]
                );

                const fkMap = {};
                for (const fk of foreignKeys.rows) {
                    const constraintName = fk.constraint_name;
                    if (!fkMap[constraintName]) {
                        fkMap[constraintName] = {
                            name: constraintName,
                            type: 'FOREIGN KEY',
                            columns: [],
                            references: {
                                table: fk.foreign_table_name,
                                columns: [],
                            },
                        };
                    }

                    fkMap[constraintName].columns.push(fk.column_name);
                    fkMap[constraintName].references.columns.push(fk.foreign_column_name);
                }

                tableObj.constraints = [
                    ...tableObj.constraints,
                    ...Object.values(fkMap),
                ];

                schema.tables.push(tableObj);
            }

            const views = await pool.query(`
        SELECT table_name, view_definition
        FROM information_schema.views
        WHERE table_schema = 'public'
      `);

            for (const view of views.rows) {
                schema.views.push({
                    name: view.table_name,
                    definition: view.view_definition,
                });
            }

            const functions = await pool.query(`
        SELECT
          p.proname AS function_name,
          pg_get_functiondef(p.oid) AS function_def,
          pg_catalog.obj_description(p.oid, 'pg_proc') AS function_comment,
          pg_catalog.pg_get_function_result(p.oid) AS return_type
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
      `);

            for (const func of functions.rows) {
                const isProcedure = func.return_type === 'void';

                const parameters = [];
                const paramMatch = func.function_def.match(/\((.*?)\)/);
                if (paramMatch && paramMatch[1]) {
                    const params = paramMatch[1].split(',');
                    for (const param of params) {
                        const [name, type] = param.trim().split(' ');
                        if (name && type) {
                            parameters.push({
                                name,
                                dataType: type,
                                direction: 'IN',
                            });
                        }
                    }
                }

                const functionObj = {
                    name: func.function_name,
                    parameters,
                    body: func.function_def,
                    comment: func.function_comment,
                    returnType: isProcedure ? null : func.return_type,
                    affectedTables: this.extractAffectedTables(func.function_def),
                };

                if (isProcedure) {
                    schema.storedProcedures.push(functionObj);
                } else {
                    schema.functions.push(functionObj);
                }
            }

            const triggers = await pool.query(`
        SELECT
          t.tgname AS trigger_name,
          CASE WHEN t.tgtype & 1 = 1 THEN 'BEFORE' ELSE 'AFTER' END AS action_timing,
          CASE
            WHEN t.tgtype & 2 = 2 THEN 'INSERT'
            WHEN t.tgtype & 4 = 4 THEN 'DELETE'
            WHEN t.tgtype & 8 = 8 THEN 'UPDATE'
            ELSE 'UNKNOWN'
          END AS event_manipulation,
          c.relname AS table_name,
          pg_get_triggerdef(t.oid) AS trigger_def
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public' AND NOT t.tgisinternal
      `);

            for (const trigger of triggers.rows) {
                const triggerObj = {
                    name: trigger.trigger_name,
                    timing: trigger.action_timing,
                    event: trigger.event_manipulation,
                    table: trigger.table_name,
                    definition: trigger.trigger_def,
                    affectedTables: this.extractAffectedTables(trigger.trigger_def),
                };

                schema.triggers.push(triggerObj);
            }

            this.extractRelationships(schema);

            return schema;
        } finally {
            await pool.end();
        }
    }

    /**
     * Extract schema from MongoDB database connection
     * @param {string} host - Database host
     * @param {number} port - Database port
     * @param {string} database - Database name
     * @param {string} username - Database username
     * @param {string} password - Database password
     * @returns {Promise<Object>} Extracted schema metadata
     */
    async extractMongoDBSchemaFromConnection(
        host,
        port,
        database,
        username,
        password
    ) {
        const uri = `mongodb://${username ? `${username}:${password}@` : ''}${host}:${port || 27017}/${database}`;
        const client = new MongoClient(uri);

        try {
            await client.connect();
            const db = client.db(database);

            const schema = {
                collections: [],
                indexes: [],
                validationRules: [],
            };

            const collections = await db.listCollections().toArray();

            for (const collection of collections) {
                const collectionName = collection.name;
                const collectionObj = {
                    name: collectionName,
                    fields: {},
                    indexes: [],
                };

                const indexes = await db.collection(collectionName).indexes();
                for (const index of indexes) {
                    collectionObj.indexes.push({
                        name: index.name,
                        key: index.key,
                        unique: index.unique || false,
                    });

                    schema.indexes.push({
                        collection: collectionName,
                        name: index.name,
                        key: index.key,
                        unique: index.unique || false,
                    });
                }

                const options = collection.options;
                if (options && options.validator) {
                    collectionObj.validator = options.validator;

                    schema.validationRules.push({
                        collection: collectionName,
                        validator: options.validator,
                    });
                }

                const documents = await db
                    .collection(collectionName)
                    .find()
                    .limit(10)
                    .toArray();
                for (const doc of documents) {
                    this.extractMongoDocumentFields(doc, collectionObj.fields);
                }

                schema.collections.push(collectionObj);
            }

            return schema;
        } finally {
            await client.close();
        }
    }
}

export default SchemaExtractionService;
