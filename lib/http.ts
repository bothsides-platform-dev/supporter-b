import ky, { type KyInstance } from 'ky'

export const http: KyInstance = ky.create({
  credentials: 'same-origin',
  timeout: 10_000,
  retry: { limit: 1, statusCodes: [408, 500, 502, 503] },
  hooks: {
    afterResponse: [
      async ({ response }) => {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- an HTTP client has no router context; reloading applies the new auth state.
        if (response.status === 401) window.location.assign('/login')
      },
    ],
  },
})
