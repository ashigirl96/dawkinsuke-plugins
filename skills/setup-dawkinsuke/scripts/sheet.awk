# Reads and checks a model table. Run by check-sheet.sh with
# check-sheet.awk. POSIX awk, run under LC_ALL=C.

# Fills roles[1..n] with the roles every sheet names, in sheet order, and
# SHEET_EFFORT[level] for the reasoning effort levels. Returns n.
# The roles are the role lines of the Models section of pstack/docs/harness/claude-code.md.
function sheet_roles(roles,    n) {
  split("", roles)
  n = 0
  roles[++n] = "arena runners"
  roles[++n] = "arena cross-judge pool"
  roles[++n] = "architect runners"
  roles[++n] = "interrogate reviewers"
  roles[++n] = "swarm workers"
  roles[++n] = "how explorer"
  roles[++n] = "how explainer"
  roles[++n] = "why investigators"
  roles[++n] = "why synthesizer"
  roles[++n] = "reflect tooling"
  roles[++n] = "reflect judgment, divergent, synthesizer"
  SHEET_EFFORT["low"] = 1
  SHEET_EFFORT["medium"] = 1
  SHEET_EFFORT["high"] = 1
  SHEET_EFFORT["xhigh"] = 1
  SHEET_EFFORT["max"] = 1
  return n
}

# Adds one line decoded by read-sheet.sh to SHEET[1..SHEET_N].
function sheet_add(line) {
  SHEET[++SHEET_N] = line
}

function sheet_trim(s) {
  sub(/^[ \t]+/, "", s)
  sub(/[ \t]+$/, "", s)
  return s
}

# Drops a role value's reasoning effort suffix, as in `opus @xhigh`.
# Call sheet_roles first.
function sheet_model(e,    level) {
  if (match(e, /[ \t]+@[a-z]+$/)) {
    level = substr(e, RSTART)
    sub(/^[ \t]+@/, "", level)
    if (level in SHEET_EFFORT) e = substr(e, 1, RSTART - 1)
  }
  return e
}

function sheet_alias(id) {
  return id == "inherit-parent" || id == "auto"
}

# The key of `key: value` at the start of a line, or "" for any other line.
function sheet_key(line) {
  return line ~ /^[^ \t]/ && index(line, ":") ? sheet_trim(substr(line, 1, index(line, ":") - 1)) : ""
}

function sheet_value(line) {
  return sheet_trim(substr(line, index(line, ":") + 1))
}

# Parses SHEET. VALUE[role] is the last line's value for each known role, and
# VALUE["default effort"] the default effort. Returns what is wrong with the
# sheet as "; "-separated problems, or "" when it is well formed: a missing
# role, an entry that is not inherit-parent, auto, or a model ID with an
# optional effort, or a default effort that is not session or a level.
# A problem quotes no unchecked sheet text.
function sheet_problems(    roles, n, want, i, key, out, E, m, j, e) {
  n = sheet_roles(roles)
  split("", want)
  for (i = 1; i <= n; i++) want[roles[i]] = 1
  split("", VALUE)
  for (i = 1; i <= SHEET_N; i++) {
    key = sheet_key(SHEET[i])
    if (key in want || key == "default effort") VALUE[key] = sheet_value(SHEET[i])
  }
  out = ""
  for (i = 1; i <= n; i++) if (!(roles[i] in VALUE)) out = out "; missing role `" roles[i] "`"
  if (("default effort" in VALUE) && VALUE["default effort"] != "session" && !(VALUE["default effort"] in SHEET_EFFORT)) out = out "; default effort is not session or a level"
  for (i = 1; i <= n; i++) {
    key = roles[i]
    if (!(key in VALUE)) continue
    m = split(VALUE[key], E, ",")
    if (m == 0) out = out "; no model in `" key "`"
    for (j = 1; j <= m; j++) {
      e = sheet_model(sheet_trim(E[j]))
      if (e == "") { out = out "; an empty entry in `" key "`"; continue }
      if (sheet_alias(e)) continue
      if (e !~ /^[a-z0-9][a-z0-9.-]*$/) out = out "; `" key "` has an entry that is not a model ID"
    }
  }
  return substr(out, 3)
}
