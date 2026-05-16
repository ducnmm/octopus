# Specs

This directory is the source of truth for Octopus.

## Workflow

1. Write or update the relevant spec.
2. Add acceptance criteria.
3. Record architecture decisions in `../adr/` when the choice affects future implementation.
4. Implement the smallest code path that satisfies the acceptance criteria.
5. Add tests that map back to the acceptance file.

## Spec Map

- `00-vision.md`: product thesis and principles
- `01-mvp-scope.md`: what is in and out for the hackathon MVP
- `02-user-flows.md`: end-user flows
- `03-architecture.md`: system shape and source-of-truth boundaries
- `04-domain-model.md`: on-chain and off-chain domain objects
- `05-implementation-plan.md`: build order
- `protocols/`: contracts between CLI, server, Sui, Walrus, and Git
- `acceptance/`: user-observable behavior that must pass
- `api/openapi.yaml`: HTTP API contract

## Naming

Use:

- `Octopus` for product and type names
- `octopus` for CLI, domains, config directories, and protocol names

