.PHONY: quality quality-ci

quality:
	./tests/run_quality_gates.sh --profile local

quality-ci:
	./tests/run_quality_gates.sh --profile ci --output-dir test-results/quality/ci
