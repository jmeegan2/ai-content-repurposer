# Sonar Workflow

## Goal

Generate coverage and run a full SonarCloud analysis across the entire project (backend + frontend).

---

## Steps

### 1. Generate backend coverage

```bash
cd backend && npm run test:coverage
```

### 2. Run SonarCloud scan from project root

```bash
cd .. && SONAR_TOKEN=$(grep SONAR_TOKEN backend/.env | cut -d= -f2) sonar-scanner
```

If `sonar-scanner` is not installed, tell the user to run:
```bash
brew install sonar-scanner
```

### 3. Report results

Tell the user the scan has been submitted and results are viewable at:
https://sonarcloud.io/project/overview?id=jmeegan2_ai-content-repurposer
