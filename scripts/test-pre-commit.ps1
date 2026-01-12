# Pre-commit hook test script
# Tests all pre-commit checks without actually committing

Write-Host ""
Write-Host "=========================================="
Write-Host "Running pre-commit checks (TEST MODE)..."
Write-Host "=========================================="
Write-Host ""

$exitCode = 0

# [1/5] Build check
Write-Host "[1/5] Building project..."
npm run build
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Build successful"
} else {
    Write-Host "[FAIL] Build failed - commit would be aborted"
    $exitCode = 1
}
Write-Host ""

if ($exitCode -eq 0) {
    # [2/5] RECON self-check
    Write-Host "[2/5] Running RECON self-check..."
    npm run recon:self *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] RECON self-check passed"
    } else {
        Write-Host "[FAIL] RECON self-check failed - commit would be aborted"
        $exitCode = 1
    }
    Write-Host ""
}

if ($exitCode -eq 0) {
    # [3/5] Tests
    Write-Host "[3/5] Running tests..."
    npm test
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] All tests passed"
    } else {
        Write-Host "[FAIL] Tests failed - commit would be aborted"
        $exitCode = 1
    }
    Write-Host ""
}

if ($exitCode -eq 0) {
    # [4/5] RSS stats
    Write-Host "[4/5] Running RSS stats check..."
    npm run rss:stats *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] RSS stats check passed"
    } else {
        Write-Host "[FAIL] RSS stats check failed - commit would be aborted"
        $exitCode = 1
    }
    Write-Host ""
}

if ($exitCode -eq 0) {
    # [5/5] Test coverage
    Write-Host "[5/5] Checking test coverage..."
    $MIN_COVERAGE = 50
    $COVERAGE_OUTPUT = npm run test:coverage 2>&1 | Out-String
    
    # Try to extract coverage percentage
    if ($COVERAGE_OUTPUT -match 'Statements\s+:\s+(\d+\.?\d*)') {
        $COVERAGE_PERCENT = $matches[1]
    } elseif ($COVERAGE_OUTPUT -match 'Statements\s+\|\s+(\d+\.?\d*)') {
        $COVERAGE_PERCENT = $matches[1]
    } else {
        $COVERAGE_PERCENT = $null
    }
    
    if ([string]::IsNullOrEmpty($COVERAGE_PERCENT)) {
        Write-Host "[WARN] Could not parse coverage percentage - skipping coverage check"
    } else {
        $COVERAGE_INT = [int][Math]::Floor([double]$COVERAGE_PERCENT)
        if ($COVERAGE_INT -ge $MIN_COVERAGE) {
            Write-Host "[OK] Test coverage is ${COVERAGE_PERCENT}% (minimum: ${MIN_COVERAGE}%)"
        } else {
            Write-Host "[FAIL] Test coverage is ${COVERAGE_PERCENT}% (minimum: ${MIN_COVERAGE}%) - commit would be aborted"
            $exitCode = 1
        }
    }
    Write-Host ""
}

if ($exitCode -eq 0) {
    Write-Host "=========================================="
    Write-Host "All pre-commit checks passed!"
    Write-Host "=========================================="
    Write-Host ""
} else {
    Write-Host "=========================================="
    Write-Host "Pre-commit checks FAILED"
    Write-Host "Commit would be blocked"
    Write-Host "=========================================="
    Write-Host ""
}

exit $exitCode

