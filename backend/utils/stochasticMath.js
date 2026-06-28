/**
 * Stochastic Calculus utility for generating randomized market trajectory simulations
 * Implements Geometric Brownian Motion (GBM) and Vasicek Interest Rate models (#480)
 */

class StochasticMath {
    /**
     * Box-Muller transform to generate normally distributed random variables (mean = 0, std = 1)
     */
    static generateStandardNormal() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    /**
     * Geometric Brownian Motion (GBM)
     * Used for simulating asset prices (like stocks) that cannot drop below zero.
     * S(t) = S(0) * exp((mu - (sigma^2)/2) * t + sigma * W(t))
     * 
     * @param {number} initialValue Starting wealth
     * @param {number} expectedReturn (mu) Annualized expected return
     * @param {number} volatility (sigma) Annualized standard deviation of returns
     * @param {number} years Years to simulate
     * @param {number} stepsPerYear e.g., 1 (yearly) or 12 (monthly)
     * @returns {number[]} Array of values representing the simulated path
     */
    static generateGBMPath(initialValue, expectedReturn, volatility, years, stepsPerYear = 1) {
        const path = [initialValue];
        const dt = 1.0 / stepsPerYear;
        const totalSteps = years * stepsPerYear;
        let currentValue = initialValue;

        const drift = (expectedReturn - 0.5 * Math.pow(volatility, 2)) * dt;
        const shock = volatility * Math.sqrt(dt);

        for (let i = 1; i <= totalSteps; i++) {
            const z = this.generateStandardNormal();
            currentValue = currentValue * Math.exp(drift + shock * z);
            path.push(currentValue);
        }

        return path;
    }

    /**
     * Vasicek Interest Rate Model
     * Used for simulating bond yields / interest rates which mean-revert
     * dr(t) = a * (b - r(t))dt + sigma * dW(t)
     * 
     * @param {number} initialRate S_{0} starting rate
     * @param {number} speedOfReversion (a) Speed at which it reverts to long-term mean
     * @param {number} longTermMean (b) The long-term mean rate level
     * @param {number} volatility (sigma) Standard deviation of the interest rate
     * @param {number} years Years to simulate
     * @param {number} stepsPerYear Simulation resolution
     * @returns {number[]} Array of simulated interest rates
     */
    static generateVasicekPath(initialRate, speedOfReversion, longTermMean, volatility, years, stepsPerYear = 1) {
        const path = [initialRate];
        const dt = 1.0 / stepsPerYear;
        const totalSteps = years * stepsPerYear;
        let currentRate = initialRate;

        for (let i = 1; i <= totalSteps; i++) {
            const z = this.generateStandardNormal();
            // Euler-Maruyama discretization
            const dr = speedOfReversion * (longTermMean - currentRate) * dt + volatility * Math.sqrt(dt) * z;
            currentRate += dr;
            path.push(currentRate);
        }

        return path;
    }
}

export default StochasticMath;
