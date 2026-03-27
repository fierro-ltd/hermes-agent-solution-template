# Documentation

Comprehensive guides for understanding, deploying, and customizing the Hermes Agent Solution Template (HAST).

| Document | What it covers | Start here if... |
|----------|---------------|------------------|
| [**ARCHITECTURE.md**](ARCHITECTURE.md) | System design, container diagram, communication patterns, technology rationale, security model | You want to understand how the template works |
| [**API.md**](API.md) | Every REST endpoint with methods, request/response bodies, curl examples | You're building an integration or frontend |
| [**DEPLOYMENT.md**](DEPLOYMENT.md) | Local dev setup, Docker Compose, production deployment (Hetzner/Lightsail), SSL, monitoring | You're setting up or deploying the template |
| [**WORKFLOWS.md**](WORKFLOWS.md) | Temporal workflow engine, activities, signals, human-in-the-loop pattern | You want to understand or extend the workflow engine |
| [**CUSTOMIZATION.md**](CUSTOMIZATION.md) | How to fork the template and build your own use case, switch providers, extend the system | You're adapting the template for a different domain |
| [**DATA_MODEL.md**](DATA_MODEL.md) | ER diagram, all 7 tables, column types, indexes, status enums, example queries, migrations | You're working with the database or adding new tables |

## Reading Order

**New to the project?** Start with ARCHITECTURE → DEPLOYMENT → WORKFLOWS.

**Forking for your own use case?** Start with CUSTOMIZATION → API → DATA_MODEL.

**Debugging an issue?** Check WORKFLOWS (for Temporal) or API (for endpoint behavior).
