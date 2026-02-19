-- ============================================================
-- 002_db_explorer_functions.sql — Read-only database explorer
-- Run this in the Supabase SQL editor or via supabase db push
-- ============================================================

-- ==================== LIST TABLES ====================
create or replace function public.db_explorer_list_tables()
returns table (
  table_name text,
  row_estimate bigint,
  column_count int,
  total_size text,
  total_size_bytes bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    t.tablename::text as table_name,
    coalesce(s.n_live_tup, 0)::bigint as row_estimate,
    (
      select count(*)::int
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = t.tablename
    ) as column_count,
    pg_size_pretty(pg_total_relation_size(quote_ident(t.tablename)::regclass))::text as total_size,
    pg_total_relation_size(quote_ident(t.tablename)::regclass)::bigint as total_size_bytes
  from pg_tables t
  left join pg_stat_user_tables s
    on s.schemaname = t.schemaname
    and s.relname = t.tablename
  where t.schemaname = 'public'
  order by t.tablename;
end;
$$;

-- ==================== TABLE COLUMNS ====================
create or replace function public.db_explorer_table_columns(p_table_name text)
returns table (
  column_name text,
  data_type text,
  is_nullable boolean,
  column_default text,
  is_primary_key boolean,
  ordinal_position int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Validate table exists in public schema
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = p_table_name
  ) then
    raise exception 'Table "%" does not exist in public schema', p_table_name;
  end if;

  return query
  select
    c.column_name::text,
    c.data_type::text,
    (c.is_nullable = 'YES')::boolean as is_nullable,
    c.column_default::text,
    (
      kcu.column_name is not null
    )::boolean as is_primary_key,
    c.ordinal_position::int
  from information_schema.columns c
  left join information_schema.key_column_usage kcu
    on kcu.table_schema = c.table_schema
    and kcu.table_name = c.table_name
    and kcu.column_name = c.column_name
    and exists (
      select 1
      from information_schema.table_constraints tc
      where tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
        and tc.constraint_type = 'PRIMARY KEY'
    )
  where c.table_schema = 'public'
    and c.table_name = p_table_name
  order by c.ordinal_position;
end;
$$;

-- ==================== TABLE INDEXES ====================
create or replace function public.db_explorer_table_indexes(p_table_name text)
returns table (
  index_name text,
  index_definition text,
  is_unique boolean,
  index_size text,
  index_size_bytes bigint,
  idx_scan bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Validate table exists in public schema
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = p_table_name
  ) then
    raise exception 'Table "%" does not exist in public schema', p_table_name;
  end if;

  return query
  select
    i.indexname::text as index_name,
    i.indexdef::text as index_definition,
    coalesce(ix.indisunique, false)::boolean as is_unique,
    pg_size_pretty(pg_relation_size(ic.oid))::text as index_size,
    pg_relation_size(ic.oid)::bigint as index_size_bytes,
    coalesce(psi.idx_scan, 0)::bigint as idx_scan
  from pg_indexes i
  join pg_class ic
    on ic.relname = i.indexname
    and ic.relnamespace = (select oid from pg_namespace where nspname = 'public')
  left join pg_index ix
    on ix.indexrelid = ic.oid
  left join pg_stat_user_indexes psi
    on psi.indexrelname = i.indexname
    and psi.schemaname = 'public'
  where i.schemaname = 'public'
    and i.tablename = p_table_name;
end;
$$;

-- ==================== TABLE ROWS (paginated, searchable) ====================
create or replace function public.db_explorer_table_rows(
  p_table_name text,
  p_sort_column text default null,
  p_sort_direction text default 'ASC',
  p_page_offset int default 0,
  p_page_size int default 25,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  total bigint;
  rows_json jsonb;
  query_text text;
  count_text text;
  where_clause text := '';
begin
  -- Validate table exists in public schema
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = p_table_name
  ) then
    raise exception 'Table "%" does not exist in public schema', p_table_name;
  end if;

  -- Cap page size at 100
  if p_page_size > 100 then
    p_page_size := 100;
  end if;

  -- Default sort direction to ASC if not valid
  if p_sort_direction not in ('ASC', 'DESC') then
    p_sort_direction := 'ASC';
  end if;

  -- Validate sort column exists if provided
  if p_sort_column is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = p_table_name
        and column_name = p_sort_column
    ) then
      raise exception 'Column "%" does not exist in table "%"', p_sort_column, p_table_name;
    end if;
  end if;

  -- Build WHERE clause for search
  if p_search is not null and p_search <> '' then
    where_clause := ' WHERE (SELECT ' || quote_ident(p_table_name) || '::text FROM (SELECT t.*) AS ' || quote_ident(p_table_name) || ') ILIKE ''%'' || ' || quote_literal(p_search) || ' || ''%''';
  end if;

  -- Get total count
  count_text := 'SELECT count(*) FROM ' || quote_ident(p_table_name) || ' t';
  if p_search is not null and p_search <> '' then
    count_text := count_text || ' WHERE t::text ILIKE ''%'' || ' || quote_literal(p_search) || ' || ''%''';
  end if;
  execute count_text into total;

  -- Build main query
  query_text := 'SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb), ''[]''::jsonb) FROM (SELECT * FROM ' || quote_ident(p_table_name) || ' t';
  if p_search is not null and p_search <> '' then
    query_text := query_text || ' WHERE t::text ILIKE ''%'' || ' || quote_literal(p_search) || ' || ''%''';
  end if;

  -- Add ORDER BY
  if p_sort_column is not null then
    query_text := query_text || ' ORDER BY ' || quote_ident(p_sort_column) || ' ' || p_sort_direction;
  end if;

  -- Add LIMIT and OFFSET
  query_text := query_text || ' LIMIT ' || p_page_size || ' OFFSET ' || p_page_offset;
  query_text := query_text || ') t';

  execute query_text into rows_json;

  return jsonb_build_object(
    'rows', coalesce(rows_json, '[]'::jsonb),
    'total_count', total,
    'page_size', p_page_size,
    'page_offset', p_page_offset
  );
end;
$$;

-- ==================== DATABASE STATS ====================
create or replace function public.db_explorer_stats()
returns table (
  table_count int,
  total_size text,
  total_size_bytes bigint,
  index_count int,
  index_size text,
  index_size_bytes bigint,
  extensions text[],
  pg_version text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_count int;
  v_total_size_bytes bigint;
  v_index_count int;
  v_index_size_bytes bigint;
begin
  -- Count tables in public schema
  select count(*)::int into v_table_count
  from pg_tables
  where schemaname = 'public';

  -- Sum total relation sizes for all public tables
  select coalesce(sum(pg_total_relation_size(quote_ident(tablename)::regclass)), 0)::bigint
  into v_total_size_bytes
  from pg_tables
  where schemaname = 'public';

  -- Count indexes and sum their sizes
  select
    count(*)::int,
    coalesce(sum(pg_relation_size(ic.oid)), 0)::bigint
  into v_index_count, v_index_size_bytes
  from pg_indexes i
  join pg_class ic
    on ic.relname = i.indexname
    and ic.relnamespace = (select oid from pg_namespace where nspname = 'public')
  where i.schemaname = 'public';

  return query
  select
    v_table_count as table_count,
    pg_size_pretty(v_total_size_bytes)::text as total_size,
    v_total_size_bytes as total_size_bytes,
    v_index_count as index_count,
    pg_size_pretty(v_index_size_bytes)::text as index_size,
    v_index_size_bytes as index_size_bytes,
    (array(select extname::text from pg_extension))::text[] as extensions,
    version()::text as pg_version;
end;
$$;
