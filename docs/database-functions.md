# Database Functions

## handle_new_user (trigger)

Creates a profile row when a new user signs up via Supabase Auth. Runs on `INSERT` to `auth.users`.

```sql
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
```

---

## deduct_credits

Atomically deducts credits from a user's profile. The check and update happen in a single SQL statement — no race condition between reading and writing.

```sql
UPDATE profiles
SET credits_remaining = credits_remaining - p_amount,
    credits_used = credits_used + p_amount
WHERE id = p_user_id AND credits_remaining >= p_amount;

RETURN FOUND;
```

**Arguments:** `p_user_id uuid, p_amount integer` — **Returns:** `boolean`

Called via `supabase.rpc("deduct_credits", {"p_user_id": ..., "p_amount": ...})` in `services/credits.py`. Returns false if insufficient credits.

---

## refund_credits

Adds credits back to a user's profile and decrements `credits_used`. Atomic — no read required.

```sql
UPDATE profiles
SET credits_remaining = credits_remaining + p_amount,
    credits_used = credits_used - p_amount
WHERE id = p_user_id;
```

**Arguments:** `p_user_id uuid, p_amount integer` — **Returns:** `void`

> Note: Python `add_credits` in `services/credits.py` does a read-then-write and does not decrement `credits_used`. Should be replaced with `supabase.rpc("refund_credits", ...)`.

---

## set_job_completed_at (trigger)

Sets `completed_at` on a job row the first time it transitions to a terminal state (`done`, `failed`, `cancelled`). Duration is derived on demand as `completed_at - created_at`.

```sql
BEGIN
  IF NEW.status IN ('done', 'failed', 'cancelled')
     AND OLD.status NOT IN ('done', 'failed', 'cancelled') THEN
    NEW.completed_at = now();
  END IF;
  RETURN NEW;
END;
```

Trigger: `BEFORE UPDATE ON jobs FOR EACH ROW`.

---

## cleanup_stuck_jobs (pg_cron, hourly)

Marks jobs that have been non-terminal for over 60 minutes as `failed` and refunds their credits. Handles the case where Modal times out and hard-kills the container without updating the DB.

The `credits_deducted` value is read into memory before being zeroed, so the refund uses the correct original amount. The status check on the UPDATE prevents overwriting a job that completed between the SELECT and the UPDATE.

```sql
FOR stuck IN
  SELECT id, user_id, credits_deducted
  FROM jobs
  WHERE status NOT IN ('done', 'failed', 'cancelled')
    AND updated_at < now() - interval '60 minutes'
LOOP
  UPDATE jobs
  SET status = 'failed',
      error = 'Job timed out — credits have been refunded',
      credits_deducted = 0
  WHERE id = stuck.id
    AND status NOT IN ('done', 'failed', 'cancelled');

  IF FOUND AND stuck.credits_deducted > 0 THEN
    UPDATE profiles
    SET credits_remaining = credits_remaining + stuck.credits_deducted,
        updated_at = now()
    WHERE id = stuck.user_id;
  END IF;
END LOOP;
```

Scheduled via pg_cron: `'0 * * * *'` (top of every hour). Enable pg_cron under **Database → Extensions** in Supabase.
