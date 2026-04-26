.DEFAULT_GOAL := help

SHELL := /bin/bash

ROOT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
ENV_FILE := $(ROOT_DIR).env
ENV_EXAMPLE := $(ROOT_DIR).env.example

COMPOSE_LOCAL := docker compose --project-directory $(ROOT_DIR) --env-file $(ENV_FILE) -p ausbildungsdoku-local -f $(ROOT_DIR)docker-compose.local.yml
COMPOSE_INFRA := docker compose --project-directory $(ROOT_DIR) --env-file $(ENV_FILE) -p ausbildungsdoku-dev-infra -f $(ROOT_DIR)docker-compose.dev-infra.yml

.PHONY: help up down restart logs ps config infra-up infra-down infra-logs clean ensure-env check-docker wait-app

help:
	@echo "Verfuegbare Ziele:"
	@echo "  make up         - Full-Docker-Stack starten (App, MSSQL, Redis)"
	@echo "  make down       - Full-Docker-Stack stoppen"
	@echo "  make restart    - Full-Docker-Stack neu starten"
	@echo "  make logs       - Logs des Full-Docker-Stacks anzeigen"
	@echo "  make ps         - Containerstatus des Full-Docker-Stacks anzeigen"
	@echo "  make config     - Aufgeloeste Compose-Konfiguration pruefen"
	@echo "  make infra-up   - Nur MSSQL und Redis fuer Host-Entwicklung starten"
	@echo "  make infra-down - Dev-Infra wieder stoppen"
	@echo "  make infra-logs - Logs der Dev-Infra anzeigen"
	@echo "  make clean      - Full-Docker-Stack inkl. Volumes entfernen"

ensure-env:
	@if [ ! -f "$(ENV_FILE)" ]; then \
		cp "$(ENV_EXAMPLE)" "$(ENV_FILE)"; \
		echo ".env wurde aus .env.example erstellt. Bitte Secrets vor produktiver Nutzung anpassen."; \
	fi

check-docker:
	@docker info >/dev/null 2>&1 || (echo "Docker ist nicht erreichbar. Bitte Docker starten." && exit 1)
	@docker compose version >/dev/null 2>&1 || (echo "Docker Compose ist nicht verfuegbar." && exit 1)

up: ensure-env check-docker
	@$(COMPOSE_LOCAL) up -d --build
	@$(MAKE) wait-app
	@echo "App bereit: http://127.0.0.1:$$( $(COMPOSE_LOCAL) port app 3010 | sed 's/.*://' )"

wait-app:
	@container_id="$$( $(COMPOSE_LOCAL) ps -q app )"; \
	if [ -z "$$container_id" ]; then \
		echo "App-Container wurde nicht erstellt."; \
		exit 1; \
	fi; \
	for attempt in $$(seq 1 60); do \
		status="$$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $$container_id 2>/dev/null || true)"; \
		if [ "$$status" = "healthy" ]; then \
			exit 0; \
		fi; \
		if [ "$$status" = "exited" ] || [ "$$status" = "dead" ]; then \
			echo "App-Container ist unerwartet beendet."; \
			$(COMPOSE_LOCAL) logs app; \
			exit 1; \
		fi; \
		sleep 2; \
	done; \
	echo "App wurde nicht rechtzeitig healthy."; \
	$(COMPOSE_LOCAL) ps; \
	$(COMPOSE_LOCAL) logs app; \
	exit 1

down: ensure-env check-docker
	@$(COMPOSE_LOCAL) down

restart: down up

logs: ensure-env check-docker
	@$(COMPOSE_LOCAL) logs -f --tail=200

ps: ensure-env check-docker
	@$(COMPOSE_LOCAL) ps

config: ensure-env check-docker
	@$(COMPOSE_LOCAL) config

infra-up: ensure-env check-docker
	@$(COMPOSE_INFRA) up -d
	@echo "Dev-Infra bereit: MSSQL auf $$( $(COMPOSE_INFRA) port mssql 1433 ), Redis auf $$( $(COMPOSE_INFRA) port redis 6379 )"

infra-down: ensure-env check-docker
	@$(COMPOSE_INFRA) down

infra-logs: ensure-env check-docker
	@$(COMPOSE_INFRA) logs -f --tail=200

clean: ensure-env check-docker
	@$(COMPOSE_LOCAL) down -v --remove-orphans
