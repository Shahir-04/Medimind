import argparse
import json
import os
from contextlib import closing

import psycopg2
from dotenv import load_dotenv
from psycopg2 import sql
from psycopg2.extras import execute_batch

from backend.embeddings import EMBEDDING_BATCH_SIZE, EMBEDDING_MODEL, embed_documents, embed_texts
from backend.pinecone_helper import get_pinecone_kb


# Each entry names the existing table, vector column, and source text columns.
POSTGRES_STORES = (
    ("public", "documents", "embedding", "content, filename"),
    ("vecs", "medimind_memories", "vec", "metadata->>'data', NULL"),
    ("vecs", "medimind_feedback", "vec", "metadata->>'data', NULL"),
)


def reembed_table(connection, schema, name, vector_column, text_columns):
    """Replace a table's vectors in batches while retaining row IDs and metadata."""
    table = sql.Identifier(schema, name)
    column = sql.Identifier(vector_column)
    select = sql.SQL("SELECT id, {} FROM {} WHERE {} IS NOT NULL").format(
        sql.SQL(text_columns), table, column
    )
    update = sql.SQL("UPDATE {} SET {} = %s WHERE id = %s").format(table, column)

    count = 0
    with connection.cursor(name="old_vectors") as rows, connection.cursor() as writes:
        rows.execute(select)
        while batch := rows.fetchmany(EMBEDDING_BATCH_SIZE):
            if any(not text or not text.strip() for _, text, _ in batch):
                raise ValueError(f"A row in {schema}.{name} is missing its source text.")
            if schema == "vecs":
                # Match the text normalization in Mem0's Gemini adapter.
                vectors = embed_texts(text.replace("\n", " ") for _, text, _ in batch)
            else:
                vectors = embed_documents((title, text) for _, text, title in batch)
            updates = [
                (json.dumps(vector, allow_nan=False), row_id)
                for (row_id, _, _), vector in zip(batch, vectors, strict=True)
            ]
            execute_batch(writes, update, updates)
            count += len(batch)
    return count


def reembed_postgres():
    """Convert all Supabase vectors in one transaction during the backend cutover."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("Set DATABASE_URL to migrate Supabase vectors.")

    migrated = {}
    with closing(psycopg2.connect(database_url)) as connection, connection:
        stores = []
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout = '5s'")
            for store in POSTGRES_STORES:
                schema, name, _, _ = store
                cursor.execute("SELECT to_regclass(%s)", (f"{schema}.{name}",))
                if cursor.fetchone()[0] is not None:
                    # Prevent inserts or updates from mixing model vectors during the migration.
                    cursor.execute(sql.SQL("LOCK TABLE {} IN SHARE ROW EXCLUSIVE MODE").format(
                        sql.Identifier(schema, name)
                    ))
                    stores.append(store)
        for schema, name, column, text_columns in stores:
            migrated[f"{schema}.{name}"] = reembed_table(connection, schema, name, column, text_columns)

    for table, count in migrated.items():
        print(f"Re-embedded {count} rows in {table}.")
    if not migrated:
        print("No MediMind vector tables found in this database.")


def reembed_pinecone():
    """Copy reference chunks from the old namespace using Gemini vectors and the same IDs."""
    index = get_pinecone_kb().index
    count = 0
    for ids in index.list(namespace="", limit=EMBEDDING_BATCH_SIZE):
        records = index.fetch(ids=ids, namespace="").vectors
        metadata = [records[record_id].metadata or {} for record_id in ids]
        if any(not row.get("text") for row in metadata):
            raise ValueError("A Pinecone record is missing its source text.")
        embeddings = embed_documents((row.get("source"), row["text"]) for row in metadata)
        vectors = [
            {"id": record_id, "values": embedding, "metadata": row}
            for record_id, embedding, row in zip(ids, embeddings, metadata, strict=True)
        ]
        index.upsert(vectors=vectors, namespace=EMBEDDING_MODEL)
        count += len(vectors)
    print(f"Re-embedded {count} Pinecone records into {EMBEDDING_MODEL}.")


def main():
    """Run the requested vector migration using the backend environment."""
    parser = argparse.ArgumentParser(description="Re-embed MediMind vectors with Gemini Embedding 2.")
    parser.add_argument("store", choices=("postgres", "pinecone"))
    args = parser.parse_args()
    load_dotenv()
    if args.store == "postgres":
        reembed_postgres()
    else:
        reembed_pinecone()


if __name__ == "__main__":
    main()
