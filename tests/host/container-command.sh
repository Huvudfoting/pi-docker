#!/usr/bin/env bash
# Shared by the host runner and fake-CLI regression tests. No work at source time.
run_container() {
  local label="$1" name="$project-$case_number-$1"
  printf '%s\n' "$name" >> "$root/containers.txt"
  printf 'Container receipt: %s (%s)\n' "$name" "$label"
  # Batch probes must never read the caller's terminal. GNU timeout normally
  # creates a separate process group; terminal reads can stop that whole group
  # with SIGTTIN, including the timer. Close stdin AND disable Compose interactivity.
  # A timeout remains uncertain: --rm removes containers on their own exit only.
  timeout --kill-after=5s 120s env -u COMPOSE_FILE -u COMPOSE_ENV_FILES \
    -u COMPOSE_PROJECT_NAME -u COMPOSE_PROFILES -u COMPOSE_PATH_SEPARATOR \
    COMPOSE_DISABLE_ENV_FILE=1 docker compose --env-file /dev/null \
    --project-directory "$fixtures" -p "$project" "${compose_files[@]}" \
    run --rm --no-deps --pull never -T --interactive=false --name "$name" probe </dev/null
}
