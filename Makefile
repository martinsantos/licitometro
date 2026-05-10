.PHONY: test check backend-test frontend-test frontend-build backend-syntax e2e-smoke

test: check

check:
	bash scripts/check-local.sh

backend-syntax:
	find backend/scrapers backend/services backend/routers backend/utils backend/models backend/db -name '*.py' -exec env PYTHONPYCACHEPREFIX=/private/tmp/licitometro-pycache python3 -m py_compile {} +

backend-test:
	python3 -m pytest -q

frontend-test:
	npm --prefix frontend test -- --watchAll=false --passWithNoTests

frontend-build:
	npm --prefix frontend run build

e2e-smoke:
	npm --prefix frontend run e2e:smoke
