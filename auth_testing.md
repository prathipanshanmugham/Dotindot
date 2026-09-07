# Auth Testing Playbook (Dotindot Ops)

Auth: JWT bearer via POST /api/auth/login → {"access_token", "token_type", "user"}.
Bearer header preferred: Authorization: Bearer <token>.

## Quick verification
```
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@dotindot.com","password":"Dotindot@2026"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s "$API_URL/api/auth/me" -H "Authorization: Bearer $TOKEN"
```

## MongoDB verification
```
mongosh
use test_database
db.users.find({}, {email:1, role:1, is_active:1})
db.users.findOne({role:"admin"}, {password_hash:1})   # bcrypt hash starts with $2b$
db.activity_logs.find().sort({timestamp:-1}).limit(5)
```

## RBAC checks
- employee@dotindot.com must receive 403 on: POST/PUT/DELETE /api/clients*, credential reveal, GET /api/clients, POST /api/projects, GET /api/users, GET /api/logs
- Credential reveal allowed only for admin and pm.
- All creds in /app/memory/test_credentials.md
