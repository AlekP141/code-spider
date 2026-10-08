export type SignupFormProps = { onSubmit: (email: string) => void }

export function SignupForm(props: SignupFormProps): JSX.Element {
  return <button onClick={() => props.onSubmit('a@b.c')}>Sign up</button>
}

export function Page(): JSX.Element {
  return (
    <div>
      <SignupForm onSubmit={() => undefined} />
    </div>
  )
}
