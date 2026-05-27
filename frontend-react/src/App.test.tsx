import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from './App'

describe('App', () => {
  it('renders janadesh landing shell', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { elections: [] } }),
      }),
    )

    render(<App />)

    expect(await screen.findByText('JANADESH')).toBeInTheDocument()
    expect(screen.getByText(/Vote With Confidence/i)).toBeInTheDocument()
  })
})
