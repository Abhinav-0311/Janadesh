import { PoolClient } from 'pg';

export default {
    id: '013_alter_contract_address_nullable',
    name: 'Make contract_address nullable in elections table',

    up: async (client: PoolClient): Promise<void> => {
        await client.query(`
            ALTER TABLE elections 
            ALTER COLUMN contract_address DROP NOT NULL;
        `);
    },

    down: async (client: PoolClient): Promise<void> => {
        await client.query(`
            ALTER TABLE elections 
            ALTER COLUMN contract_address SET NOT NULL;
        `);
    }
};
