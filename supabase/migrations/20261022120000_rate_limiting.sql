-- Fixed-window rate limit buckets for Edge Functions.
-- Edge isolates do not share memory, so public endpoints consume a hit
-- through consume_rate_limit (service role only). RLS is on with no
-- policies: anon/authenticated cannot read or write. service_role bypasses RLS.

CREATE TABLE public.rate_limit_buckets (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- No policies for anon or authenticated. Absence of a policy is a deny.

CREATE INDEX rate_limit_buckets_window_start_idx
  ON public.rate_limit_buckets (window_start);

REVOKE ALL ON TABLE public.rate_limit_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _key text,
  _limit integer,
  _window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _window_start timestamptz;
  _count integer;
BEGIN
  IF _key IS NULL OR length(btrim(_key)) = 0
     OR _limit IS NULL OR _limit < 1
     OR _window_seconds IS NULL OR _window_seconds < 1 THEN
    RETURN false;
  END IF;

  _window_start := to_timestamp(
    (floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds)::double precision
  );

  -- Drop this key's previous windows so the table stays one row per active key.
  DELETE FROM public.rate_limit_buckets
   WHERE key = _key
     AND window_start < _window_start;

  INSERT INTO public.rate_limit_buckets AS bucket (key, window_start, count)
  VALUES (_key, _window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = bucket.count + 1
  RETURNING count INTO _count;

  RETURN _count <= _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;
