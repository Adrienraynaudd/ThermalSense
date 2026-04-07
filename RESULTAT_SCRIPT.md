# Preuves Sprint AuthN (script)
Base URL: http://localhost:3000

## Decisions techniques
- Algorithme de signature: HS256
- Duree de vie access token: 5m
- Claims retenus: sub, role, scope, exp, aud
- Secret JWT stocke cote serveur via variable d environnement (`JWT_SECRET`).

## T1 - Endpoint de generation JWT
### Requete
POST http://localhost:3000/auth/login
Content-Type: application/json
{
  "username": "admin",
  "password": "admin123"
}
### Reponse
HTTP 200 OK
content-type: application/json; charset=utf-8
date: Tue, 07 Apr 2026 13:57:20 GMT
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsInNjb3BlIjoiYXBpOnJlYWQgYXBpOndyaXRlIiwiaWF0IjoxNzc1NTcwMjQwLCJleHAiOjE3NzU1NzA1NDAsImF1ZCI6InRoZXJtYWxzZW5zZS1hcGkifQ.JHQqvql4tjvXvWUUUioRo_4HCG3GAd1uFVh40GUc9zU",
  "tokenType": "Bearer",
  "expiresIn": "5m"
}
### Analyse
[OK] POST /auth/login retourne un token

## T2 - Claims du token
### Token decode
{
  "sub": "admin",
  "role": "admin",
  "scope": "api:read api:write",
  "iat": 1775570240,
  "exp": 1775570540,
  "aud": "thermalsense-api"
}
### Analyse
[OK] Claims presents: sub, role, scope, exp (2026-04-07T14:02:20.000Z), aud (thermalsense-api)

## T3 - Middleware JWT sur 2 endpoints
[OK] GET /building -> sans token: 401, avec token: 200
[OK] GET /zone -> sans token: 401, avec token: 200

# Tableau des preuves de tests (T4)

## Test nominal - Requete avec token valide sur endpoint protege
### Requete
GET http://localhost:3000/building
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsInNjb3BlIjoiYXBpOnJlYWQgYXBpOndyaXRlIiwiaWF0IjoxNzc1NTcwMjQwLCJleHAiOjE3NzU1NzA1NDAsImF1ZCI6InRoZXJtYWxzZW5zZS1hcGkifQ.JHQqvql4tjvXvWUUUioRo_4HCG3GAd1uFVh40GUc9zU
### Reponse
HTTP 200 OK
content-type: application/json; charset=utf-8
date: Tue, 07 Apr 2026 13:57:20 GMT
[]
### Analyse
Attendu: 200 OK ou 201 Created
Resultat: 200 OK
[OK] Le middleware accepte le JWT valide et la requete atteint bien le controleur metier.

## Test adverse 1 - Requete sans header Authorization
### Requete
GET http://localhost:3000/building
### Reponse
HTTP 401 Unauthorized
content-type: application/json; charset=utf-8
date: Tue, 07 Apr 2026 13:57:20 GMT
{
  "message": "Unauthorized"
}
### Analyse
Attendu: 401 Unauthorized
Resultat: 401 Unauthorized
[OK] Le middleware rejette correctement une requete non authentifiee avant le controleur.

## Test adverse 2 - Requete avec token expire
### Requete
GET http://localhost:3000/building
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsInNjb3BlIjoiYXBpOnJlYWQgYXBpOndyaXRlIiwiaWF0IjoxNzc1NTcwMjQwLCJleHAiOjE3NzU1NzAyMzAsImF1ZCI6InRoZXJtYWxzZW5zZS1hcGkifQ.qbKmk4TGdDfDtzGPnkZa341sPfJAbaeOCx16sEIYlFg
### Reponse
HTTP 401 Unauthorized
content-type: application/json; charset=utf-8
date: Tue, 07 Apr 2026 13:57:20 GMT
{
  "message": "Unauthorized"
}
### Analyse
Attendu: 401 Unauthorized
Resultat: 401 Unauthorized
[OK] Le middleware rejette le token expire (claim exp depasse).

## Test adverse 3 - Token a signature invalide
### Requete
GET http://localhost:3000/building
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsInNjb3BlIjoiYXBpOnJlYWQgYXBpOndyaXRlIiwiaWF0IjoxNzc1NTcwMjQwLCJleHAiOjE3NzU1NzA1NDAsImF1ZCI6InRoZXJtYWxzZW5zZS1hcGkifQ.JHQqvql4tjvXvWUUUioRo_4HCG3GAd1uFVh40GUc9za
### Reponse
HTTP 401 Unauthorized
content-type: application/json; charset=utf-8
date: Tue, 07 Apr 2026 13:57:20 GMT
{
  "message": "Unauthorized"
}
### Analyse
Attendu: 401 Unauthorized
Resultat: 401 Unauthorized
[OK] Un token modifie est refuse car la signature n est plus valide.

# Test avance (audience invalide)

## Test avance - Token avec claim aud incorrect
### Requete
GET http://localhost:3000/building
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsInNjb3BlIjoiYXBpOnJlYWQgYXBpOndyaXRlIiwiaWF0IjoxNzc1NTcwMjQwLCJleHAiOjE3NzU1NzA1NDAsImF1ZCI6Indyb25nLWF1ZGllbmNlIn0.glxp63GmZftbxa790c5Y_nehN4a4ZQqV9M_LkiVPuSs
### Reponse
HTTP 401 Unauthorized
content-type: application/json; charset=utf-8
date: Tue, 07 Apr 2026 13:57:20 GMT
{
  "message": "Unauthorized"
}
### Analyse
Attendu: 401 Unauthorized
Resultat: 401 Unauthorized
[OK] Le middleware rejette le token car le claim aud ne correspond pas a l audience attendue de l API.

# Resume final
- T1 login: [OK]
- T2 claims: [OK]
- T4 tests: [OK] (4/4)
- Test avance aud incorrect: [OK]