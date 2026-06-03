-- Update handle_new_user trigger to capture display name from OAuth/signup metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, email, username, is_anonymous)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      ''
    ),
    coalesce((new.raw_user_meta_data->>'is_anonymous')::boolean, false)
  )
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(excluded.username, public.users.username);
  return new;
end;
$$;
