import { PoolClient } from 'pg';
import database from '../config/database';
import { PaginationOptions, PaginatedResult, QueryResult } from '../models';
import logger from '../utils/logger';

export abstract class BaseRepository<T> {
    protected tableName: string;

    constructor(tableName: string) {
        this.tableName = tableName;
    }

    protected async query(text: string, params?: unknown[]): Promise<QueryResult<T>> {
        return database.query(text, params) as Promise<QueryResult<T>>;
    }

    protected async getClient(): Promise<PoolClient> {
        return database.getClient();
    }

    protected async transaction<R>(callback: (client: PoolClient) => Promise<R>): Promise<R> {
        return database.transaction(callback);
    }

    async findById(id: string): Promise<T | null> {
        try {
            const result = await this.query(
                `SELECT * FROM ${this.tableName} WHERE id = $1`,
                [id]
            );
            return result.rows[0] || null;
        } catch (error) {
            logger.error(`Error finding ${this.tableName} by id:`, error);
            throw error;
        }
    }

    async findAll(options?: PaginationOptions): Promise<PaginatedResult<T>> {
        try {
            const page = options?.page || 1;
            const limit = options?.limit || 10;
            const offset = (page - 1) * limit;
            const sortBy = options?.sort_by || 'created_at';
            const sortOrder = options?.sort_order || 'DESC';

            // Get total count
            const countResult = await this.query(`SELECT COUNT(*) FROM ${this.tableName}`) as QueryResult<{ count: string }>;
            const total = parseInt(countResult.rows[0].count);

            // Get paginated data
            const dataResult = await this.query(
                `SELECT * FROM ${this.tableName} 
         ORDER BY ${sortBy} ${sortOrder} 
         LIMIT $1 OFFSET $2`,
                [limit, offset]
            );

            const totalPages = Math.ceil(total / limit);

            return {
                data: dataResult.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    total_pages: totalPages,
                    has_next: page < totalPages,
                    has_prev: page > 1
                }
            };
        } catch (error) {
            logger.error(`Error finding all ${this.tableName}:`, error);
            throw error;
        }
    }

    async create(data: Partial<T>): Promise<T> {
        try {
            const fields = Object.keys(data).join(', ');
            const placeholders = Object.keys(data).map((_, index) => `$${index + 1}`).join(', ');
            const values = Object.values(data);

            const result = await this.query(
                `INSERT INTO ${this.tableName} (${fields}) VALUES (${placeholders}) RETURNING *`,
                values
            );

            return result.rows[0];
        } catch (error) {
            logger.error(`Error creating ${this.tableName}:`, error);
            throw error;
        }
    }

    async update(id: string, data: Partial<T>): Promise<T | null> {
        try {
            const fields = Object.keys(data);
            const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
            const values = [id, ...Object.values(data)];

            const result = await this.query(
                `UPDATE ${this.tableName} SET ${setClause} WHERE id = $1 RETURNING *`,
                values
            );

            return result.rows[0] || null;
        } catch (error) {
            logger.error(`Error updating ${this.tableName}:`, error);
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const result = await this.query(
                `DELETE FROM ${this.tableName} WHERE id = $1`,
                [id]
            );

            return result.rowCount > 0;
        } catch (error) {
            logger.error(`Error deleting ${this.tableName}:`, error);
            throw error;
        }
    }

    async exists(id: string): Promise<boolean> {
        try {
            const result = await this.query(
                `SELECT 1 FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
                [id]
            );
            return result.rows.length > 0;
        } catch (error) {
            logger.error(`Error checking existence in ${this.tableName}:`, error);
            throw error;
        }
    }

    async count(whereClause?: string, params?: unknown[]): Promise<number> {
        try {
            const query = whereClause
                ? `SELECT COUNT(*) FROM ${this.tableName} WHERE ${whereClause}`
                : `SELECT COUNT(*) FROM ${this.tableName}`;

            const result = await this.query(query, params) as QueryResult<{ count: string }>;
            return parseInt(result.rows[0].count);
        } catch (error) {
            logger.error(`Error counting ${this.tableName}:`, error);
            throw error;
        }
    }

    protected buildWhereClause(conditions: Record<string, unknown>): { clause: string; params: unknown[] } {
        const keys = Object.keys(conditions);
        if (keys.length === 0) {
            return { clause: '', params: [] };
        }

        const clause = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');
        const params = Object.values(conditions);

        return { clause: `WHERE ${clause}`, params };
    }

    async findWhere(conditions: Record<string, unknown>, options?: PaginationOptions): Promise<PaginatedResult<T>> {
        try {
            const { clause, params } = this.buildWhereClause(conditions);
            const page = options?.page || 1;
            const limit = options?.limit || 10;
            const offset = (page - 1) * limit;
            const sortBy = options?.sort_by || 'created_at';
            const sortOrder = options?.sort_order || 'DESC';

            // Get total count
            const countQuery = `SELECT COUNT(*) FROM ${this.tableName} ${clause}`;
            const countResult = await this.query(countQuery, params) as QueryResult<{ count: string }>;
            const total = parseInt(countResult.rows[0].count);

            // Get paginated data
            const dataQuery = `SELECT * FROM ${this.tableName} ${clause} ORDER BY ${sortBy} ${sortOrder} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            const dataResult = await this.query(dataQuery, [...params, limit, offset]);

            const totalPages = Math.ceil(total / limit);

            return {
                data: dataResult.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    total_pages: totalPages,
                    has_next: page < totalPages,
                    has_prev: page > 1
                }
            };
        } catch (error) {
            logger.error(`Error finding ${this.tableName} with conditions:`, error);
            throw error;
        }
    }

    async findOneWhere(conditions: Record<string, unknown>): Promise<T | null> {
        try {
            const { clause, params } = this.buildWhereClause(conditions);
            const result = await this.query(
                `SELECT * FROM ${this.tableName} ${clause} LIMIT 1`,
                params
            );
            return result.rows[0] || null;
        } catch (error) {
            logger.error(`Error finding one ${this.tableName} with conditions:`, error);
            throw error;
        }
    }
}