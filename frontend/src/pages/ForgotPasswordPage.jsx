import { useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, LockKeyhole, Mail } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import { api } from '../api/client'

// Two no-email paths: a code you saved yourself, or a one-time code from Tech Support.
const PATHS = {
  recovery: {
    label: 'I have a recovery code',
    endpoint: '/auth/recover-with-code',
    codeField: 'recoveryCode',
    codeLabel: 'Recovery code',
    hint: 'Use one of the codes you saved when your account was created. Each code works once.',
  },
  assisted: {
    label: 'Tech Support gave me a code',
    endpoint: '/auth/assisted-reset',
    codeField: 'resetCode',
    codeLabel: 'Reset code from Tech Support',
    hint: 'Ask Tech Support to issue a reset code. It expires shortly after being created.',
  },
}

export default function ForgotPasswordPage() {
  const [path, setPath] = useState('recovery')
  const [form, setForm] = useState({ email: '', code: '', newPassword: '' })
  const [state, setState] = useState({ error: '', success: '', loading: false })
  const active = PATHS[path]

  const submit = async (event) => {
    event.preventDefault()
    setState({ error: '', success: '', loading: true })
    try {
      const data = await api(active.endpoint, {
        method: 'POST',
        body: {
          email: form.email.trim(),
          [active.codeField]: form.code.trim(),
          newPassword: form.newPassword,
        },
      })
      setState({ error: '', success: data.message, loading: false })
      setForm({ email: '', code: '', newPassword: '' })
    } catch (apiError) {
      // The email is preserved; only the secret values are cleared.
      setState({ error: apiError.message, success: '', loading: false })
      setForm((current) => ({ ...current, code: '', newPassword: '' }))
    }
  }

  return (
    <AuthLayout
      title='Regain access'
      subtitle='No email is ever sent. Choose how you want to prove it is you.'
      footer={
        <p className='auth-switch'>
          <Link to='/login'>Return to sign in</Link>
        </p>
      }
    >
      <div className='segmented' role='group' aria-label='Recovery method'>
        {Object.entries(PATHS).map(([key, option]) => (
          <button
            key={key}
            type='button'
            className={`segmented__option ${path === key ? 'segmented__option--active' : ''}`}
            aria-pressed={path === key}
            onClick={() => {
              setPath(key)
              setState({ error: '', success: '', loading: false })
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className='muted-note'>{active.hint}</p>

      <div aria-live='polite' role='status'>
        {state.error && <div className='form-error'>{state.error}</div>}
        {state.success && <div className='form-success'>{state.success}</div>}
      </div>

      <form className='stack-form' onSubmit={submit}>
        <label htmlFor='recover-email'>
          Email address
          <div className='input-wrap'>
            <Mail size={18} aria-hidden='true' />
            <input
              id='recover-email'
              type='email'
              required
              autoComplete='email'
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
          </div>
        </label>

        <label htmlFor='recover-code'>
          {active.codeLabel}
          <div className='input-wrap'>
            <KeyRound size={18} aria-hidden='true' />
            <input
              id='recover-code'
              required
              autoComplete='one-time-code'
              value={form.code}
              onChange={(event) =>
                setForm({ ...form, code: event.target.value })
              }
            />
          </div>
        </label>

        <label htmlFor='recover-password'>
          New password
          <div className='input-wrap'>
            <LockKeyhole size={18} aria-hidden='true' />
            <input
              id='recover-password'
              type='password'
              minLength={8}
              required
              autoComplete='new-password'
              placeholder='At least 8 characters'
              value={form.newPassword}
              onChange={(event) =>
                setForm({ ...form, newPassword: event.target.value })
              }
            />
          </div>
        </label>

        <button
          className='button button--primary button--full'
          disabled={state.loading}
        >
          {state.loading ? (
            <span className='button-spinner' />
          ) : (
            'Set new password'
          )}
        </button>
      </form>
    </AuthLayout>
  )
}
