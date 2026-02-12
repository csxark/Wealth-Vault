import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Simple smoke test that just checks the test infrastructure works
describe('App Component', () => {
    it('basic test infrastructure works', () => {
        const div = document.createElement('div');
        expect(div).toBeDefined();
        expect(document.body).toBeInTheDocument();
    });
});
