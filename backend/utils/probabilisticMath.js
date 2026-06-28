/**
 * Probabilistic Mathematics Utilities
 * Statistical and probabilistic functions for Bayesian inference and risk modeling
 */

/**
 * Beta distribution functions for Bayesian conjugate priors
 */

// Gamma function approximation (Stirling's approximation)
function gamma(z) {
    if (z < 0.5) {
        return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    }
    z -= 1;
    const g = 7;
    const coef = [
        0.99999999999980993,
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7
    ];
    
    let x = coef[0];
    for (let i = 1; i < g + 2; i++) {
        x += coef[i] / (z + i);
    }
    
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// Beta function: B(α, β) = Γ(α) * Γ(β) / Γ(α + β)
export function betaFunction(alpha, beta) {
    return (gamma(alpha) * gamma(beta)) / gamma(alpha + beta);
}

// Beta distribution PDF: f(x; α, β) = x^(α-1) * (1-x)^(β-1) / B(α,β)
export function betaPDF(x, alpha, beta) {
    if (x < 0 || x > 1) return 0;
    if (x === 0 && alpha < 1) return Infinity;
    if (x === 1 && beta < 1) return Infinity;
    
    const logPDF = (alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - Math.log(betaFunction(alpha, beta));
    return Math.exp(logPDF);
}

// Beta distribution mean: α / (α + β)
export function betaMean(alpha, beta) {
    return alpha / (alpha + beta);
}

// Beta distribution variance: (α * β) / ((α + β)^2 * (α + β + 1))
export function betaVariance(alpha, beta) {
    const sum = alpha + beta;
    return (alpha * beta) / (sum * sum * (sum + 1));
}

// Beta distribution mode: (α - 1) / (α + β - 2) for α, β > 1
export function betaMode(alpha, beta) {
    if (alpha <= 1 || beta <= 1) {
        throw new Error('Mode undefined for α ≤ 1 or β ≤ 1');
    }
    return (alpha - 1) / (alpha + beta - 2);
}

// 95% Credible Interval for Beta distribution (approximate using quantiles)
export function betaCredibleInterval(alpha, beta, confidence = 0.95) {
    const tail = (1 - confidence) / 2;
    
    // Approximate quantile function using binary search
    function quantile(p) {
        let low = 0, high = 1;
        let mid, cdf;
        
        for (let iter = 0; iter < 100; iter++) {
            mid = (low + high) / 2;
            cdf = incompleteBeta(mid, alpha, beta);
            
            if (Math.abs(cdf - p) < 1e-6) break;
            if (cdf < p) low = mid;
            else high = mid;
        }
        return mid;
    }
    
    return {
        lower: quantile(tail),
        upper: quantile(1 - tail)
    };
}

// Incomplete Beta function (regularized) for CDF calculation
function incompleteBeta(x, alpha, beta) {
    if (x < 0 || x > 1) throw new Error('x must be in [0, 1]');
    if (x === 0) return 0;
    if (x === 1) return 1;
    
    // Use continued fraction approximation
    const tiny = 1e-30;
    const maxIterations = 200;
    
    // Continued fraction coefficients
    let m = 1, m2, aa, c, d, h, del;
    const qab = alpha + beta;
    const qap = alpha + 1;
    const qam = alpha - 1;
    
    c = 1;
    d = 1 - qab * x / qap;
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;
    h = d;
    
    for (let i = 1; i <= maxIterations; i++) {
        m2 = 2 * m;
        aa = m * (beta - m) * x / ((qam + m2) * (alpha + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < tiny) d = tiny;
        c = 1 + aa / c;
        if (Math.abs(c) < tiny) c = tiny;
        d = 1 / d;
        h *= d * c;
        
        aa = -(alpha + m) * (qab + m) * x / ((alpha + m2) * (qap + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < tiny) d = tiny;
        c = 1 + aa / c;
        if (Math.abs(c) < tiny) c = tiny;
        d = 1 / d;
        del = d * c;
        h *= del;
        
        if (Math.abs(del - 1) < 1e-10) break;
        m++;
    }
    
    const logBeta = Math.log(betaFunction(alpha, beta));
    const front = Math.exp(alpha * Math.log(x) + beta * Math.log(1 - x) - logBeta) / alpha;
    
    return front * h;
}

/**
 * Bayesian Update Functions
 */

// Update Beta distribution parameters with new evidence
export function bayesianUpdate(priorAlpha, priorBeta, successes, failures) {
    return {
        posteriorAlpha: priorAlpha + successes,
        posteriorBeta: priorBeta + failures
    };
}

// Calculate probability of default from Beta posterior
export function probabilityOfDefault(alpha, beta) {
    return betaMean(alpha, beta);
}

/**
 * Normal Distribution Functions
 */

// Standard normal CDF (cumulative distribution function)
export function normalCDF(x, mean = 0, stdDev = 1) {
    const z = (x - mean) / stdDev;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
}

// Standard normal PDF (probability density function)
export function normalPDF(x, mean = 0, stdDev = 1) {
    const z = (x - mean) / stdDev;
    return (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
}

// Inverse normal CDF (quantile function) - approximate
export function normalQuantile(p, mean = 0, stdDev = 1) {
    if (p < 0 || p > 1) throw new Error('p must be in [0, 1]');
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    if (p === 0.5) return mean;
    
    // Rational approximation for central region
    const c = [2.515517, 0.802853, 0.010328];
    const d = [1.432788, 0.189269, 0.001308];
    
    let t, z;
    if (p < 0.5) {
        t = Math.sqrt(-2 * Math.log(p));
        z = -(t - ((c[2] * t + c[1]) * t + c[0]) / (((d[2] * t + d[1]) * t + d[0]) * t + 1));
    } else {
        t = Math.sqrt(-2 * Math.log(1 - p));
        z = (t - ((c[2] * t + c[1]) * t + c[0]) / (((d[2] * t + d[1]) * t + d[0]) * t + 1));
    }
    
    return mean + stdDev * z;
}

/**
 * Value-at-Risk (VaR) Calculations
 */

// Calculate VaR from loss distribution
export function calculateVaR(lossDistribution, confidenceLevel = 0.99) {
    const sortedLosses = [...lossDistribution].sort((a, b) => a - b);
    const index = Math.floor(lossDistribution.length * confidenceLevel);
    return sortedLosses[index];
}

// Calculate Conditional VaR (CVaR / Expected Shortfall)
export function calculateCVaR(lossDistribution, confidenceLevel = 0.99) {
    const sortedLosses = [...lossDistribution].sort((a, b) => a - b);
    const index = Math.floor(lossDistribution.length * confidenceLevel);
    const tailLosses = sortedLosses.slice(index);
    return tailLosses.reduce((sum, loss) => sum + loss, 0) / tailLosses.length;
}

/**
 * Monte Carlo Simulation Helpers
 */

// Box-Muller transform for generating normal random variables
export function generateNormal(mean = 0, stdDev = 1) {
    let u1, u2;
    do {
        u1 = Math.random();
        u2 = Math.random();
    } while (u1 === 0); // Avoid log(0)
    
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stdDev * z0;
}

// Generate correlated normal variables using Cholesky decomposition
export function generateCorrelatedNormals(means, covariance) {
    const n = means.length;
    const L = choleskyDecomposition(covariance);
    const z = Array(n).fill(0).map(() => generateNormal());
    
    // Multiply L * z and add means
    const result = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            result[i] += L[i][j] * z[j];
        }
        result[i] += means[i];
    }
    
    return result;
}

// Cholesky decomposition for covariance matrix
function choleskyDecomposition(matrix) {
    const n = matrix.length;
    const L = Array(n).fill(0).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            let sum = 0;
            for (let k = 0; k < j; k++) {
                sum += L[i][k] * L[j][k];
            }
            
            if (i === j) {
                L[i][j] = Math.sqrt(matrix[i][i] - sum);
            } else {
                L[i][j] = (matrix[i][j] - sum) / L[j][j];
            }
        }
    }
    
    return L;
}

/**
 * Distribution Metrics
 */

// Calculate mean of array
export function mean(arr) {
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

// Calculate standard deviation
export function stdDev(arr) {
    const m = mean(arr);
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
    return Math.sqrt(variance);
}

// Calculate skewness
export function skewness(arr) {
    const m = mean(arr);
    const sd = stdDev(arr);
    const n = arr.length;
    const sum = arr.reduce((acc, val) => acc + Math.pow((val - m) / sd, 3), 0);
    return (n / ((n - 1) * (n - 2))) * sum;
}

// Calculate kurtosis (excess kurtosis)
export function kurtosis(arr) {
    const m = mean(arr);
    const sd = stdDev(arr);
    const n = arr.length;
    const sum = arr.reduce((acc, val) => acc + Math.pow((val - m) / sd, 4), 0);
    return (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * sum - 
           (3 * Math.pow(n - 1, 2) / ((n - 2) * (n - 3)));
}

// Calculate percentile
export function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    
    if (lower === upper) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Credit Risk Specific Functions
 */

// Merton model: probability of default based on asset value and debt
export function mertonDefaultProbability(assetValue, debt, assetVolatility, timeHorizon = 1) {
    const d2 = Math.log(assetValue / debt) / (assetVolatility * Math.sqrt(timeHorizon));
    return 1 - normalCDF(d2);
}

// Credit spread calculation
export function creditSpread(riskFreeRate, probabilityOfDefault, recoveryRate = 0.4) {
    const lossGivenDefault = 1 - recoveryRate;
    return -Math.log(1 - probabilityOfDefault * lossGivenDefault) / 1; // 1-year horizon
}

// Expected loss calculation
export function expectedLoss(exposure, probabilityOfDefault, lossGivenDefault) {
    return exposure * probabilityOfDefault * lossGivenDefault;
}

/**
 * Correlation and Covariance
 */

// Calculate correlation between two arrays
export function correlation(arr1, arr2) {
    if (arr1.length !== arr2.length) throw new Error('Arrays must have same length');
    
    const mean1 = mean(arr1);
    const mean2 = mean(arr2);
    const stdDev1 = stdDev(arr1);
    const stdDev2 = stdDev(arr2);
    
    const covariance = arr1.reduce((sum, val, i) => 
        sum + (val - mean1) * (arr2[i] - mean2), 0) / arr1.length;
    
    return covariance / (stdDev1 * stdDev2);
}

// Calculate covariance matrix
export function covarianceMatrix(dataMatrix) {
    const n = dataMatrix.length; // number of variables
    const covMatrix = Array(n).fill(0).map(() => Array(n).fill(0));
    
    const means = dataMatrix.map(arr => mean(arr));
    
    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            const cov = dataMatrix[i].reduce((sum, val, k) => 
                sum + (val - means[i]) * (dataMatrix[j][k] - means[j]), 
                0) / dataMatrix[i].length;
            covMatrix[i][j] = cov;
            covMatrix[j][i] = cov;
        }
    }
    
    return covMatrix;
}

export default {
    betaFunction,
    betaPDF,
    betaMean,
    betaVariance,
    betaMode,
    betaCredibleInterval,
    bayesianUpdate,
    probabilityOfDefault,
    normalCDF,
    normalPDF,
    normalQuantile,
    calculateVaR,
    calculateCVaR,
    generateNormal,
    generateCorrelatedNormals,
    mean,
    stdDev,
    skewness,
    kurtosis,
    percentile,
    mertonDefaultProbability,
    creditSpread,
    expectedLoss,
    correlation,
    covarianceMatrix
};
