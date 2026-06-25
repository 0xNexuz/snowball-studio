import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { ArrowUpRight, BadgeCheck, Bell, Clock3, Eye, GitBranch, LockKeyhole, Shield, Snowflake, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  CHAIN,
  EXPLORER_BASE,
  NETWORK,
  PACKAGE_ID,
  PROOF_MINT_DIGEST,
  PROOF_RECEIPT_ID,
  PROOF_VAULT_ID,
  PUBLISH_DIGEST,
  STUDIO_ID,
  SUI_CLOCK_OBJECT_ID,
} from './config'

type Recipe = {
  id: string
  typeId: number
  name: string
  steps: number
  vaultPercent: number
  clan: boolean
  guard: boolean
  tone: string
}

type MintedReceipt = Recipe & {
  digest: string
  receiptId?: string
  vaultId?: string
  amountMist: string
  seed: number[]
  mintedAt: string
}

const recipes: Recipe[] = [
  {
    id: 'split',
    typeId: 1,
    name: 'Split Snowball',
    steps: 4,
    vaultPercent: 60,
    clan: false,
    guard: true,
    tone: 'Icy blue, secure vault, clean trail',
  },
  {
    id: 'clan',
    typeId: 2,
    name: 'Clan Vault',
    steps: 5,
    vaultPercent: 45,
    clan: true,
    guard: true,
    tone: 'Shared HQ, contributor lights, warm neon',
  },
  {
    id: 'guard',
    typeId: 3,
    name: 'Avalanche Guard',
    steps: 3,
    vaultPercent: 80,
    clan: false,
    guard: true,
    tone: 'Shield room, warning glyphs, deep cyan',
  },
]

const configured = PACKAGE_ID.startsWith('0x') && STUDIO_ID.startsWith('0x')
const RECEIPT_TYPE = `${PACKAGE_ID}::snowball_studio::RecipeReceipt`

function mistFromSui(input: string) {
  const [whole = '0', fraction = ''] = input.trim().split('.')
  const padded = `${fraction}000000000`.slice(0, 9)
  return (BigInt(whole || '0') * 1_000_000_000n + BigInt(padded || '0')).toString()
}

function buildSeed(address: string | undefined, recipe: Recipe, amount: string) {
  const source = `${address ?? 'guest'}:${recipe.id}:${amount}:${Date.now()}`
  return Array.from(new TextEncoder().encode(source)).slice(0, 64)
}

function seedFromChain(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
  }

  if (typeof value === 'string') {
    try {
      return Array.from(atob(value), (char) => char.charCodeAt(0))
    } catch {
      return Array.from(new TextEncoder().encode(value))
    }
  }

  return Array.from(new TextEncoder().encode('snowball-chain-receipt'))
}

function numberField(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function receiptFromObject(data: unknown): MintedReceipt | null {
  const objectData = data as {
    objectId?: string
    previousTransaction?: string | null
    content?: { dataType?: string; fields?: Record<string, unknown> } | null
  }
  const fields = objectData.content?.fields

  if (objectData.content?.dataType !== 'moveObject' || !fields) {
    return null
  }

  const typeId = numberField(fields.recipe_type, 1)
  const baseRecipe = recipes.find((item) => item.typeId === typeId) ?? recipes[0]
  const title = typeof fields.title === 'string' ? fields.title : baseRecipe.name
  const createdMs = typeof fields.created_ms === 'string' ? Number(fields.created_ms) : Date.now()

  return {
    ...baseRecipe,
    name: title,
    typeId,
    steps: numberField(fields.steps, baseRecipe.steps),
    vaultPercent: numberField(fields.vault_percent, baseRecipe.vaultPercent),
    clan: Boolean(fields.clan_enabled),
    guard: Boolean(fields.guard_enabled),
    digest: objectData.previousTransaction ?? objectData.objectId ?? 'unknown',
    receiptId: objectData.objectId,
    vaultId: typeof fields.vault_object === 'string' ? fields.vault_object : undefined,
    amountMist: typeof fields.amount_mist === 'string' ? fields.amount_mist : '0',
    seed: seedFromChain(fields.art_seed),
    mintedAt: Number.isFinite(createdMs) ? new Date(createdMs).toISOString() : new Date().toISOString(),
  }
}

function short(id?: string) {
  if (!id) return 'pending'
  return `${id.slice(0, 6)}...${id.slice(-4)}`
}

function receiptDomId(digest: string) {
  return `receipt-${digest.replace(/[^a-zA-Z0-9_-]/g, '')}`
}

function explorer(path: 'txblock' | 'object', id: string) {
  return `${EXPLORER_BASE}/${path}/${id}?network=${NETWORK}`
}

function ReceiptArt({ receipt }: { receipt: MintedReceipt }) {
  const seedTotal = receipt.seed.reduce((sum, value) => sum + value, 0)
  const monitorCount = Math.max(3, Math.min(6, receipt.steps))
  const snowball = 56 + (Number(BigInt(receipt.amountMist) / 1_000_000n) % 36)
  const accent = receipt.clan ? '#ffb7d5' : receipt.guard ? '#8ff8d2' : '#74d7ff'
  const panels = Array.from({ length: monitorCount })

  return (
    <svg className="receipt-art" viewBox="0 0 900 900" role="img" aria-label={`${receipt.name} generated NFT artwork`}>
      <defs>
        <radialGradient id="snowGlow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#dff6ff" />
          <stop offset="100%" stopColor={accent} />
        </radialGradient>
        <linearGradient id="room" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#101827" />
          <stop offset="55%" stopColor="#182842" />
          <stop offset="100%" stopColor="#070b13" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="900" height="900" fill="url(#room)" />
      <path d="M80 92h740l-70 118H150z" fill="#223451" />
      <path d="M118 168h640" stroke={accent} strokeWidth="6" filter="url(#glow)" />
      <text x="450" y="142" textAnchor="middle" fill={accent} fontFamily="ui-monospace, monospace" fontSize="44" filter="url(#glow)">
        {receipt.name}
      </text>
      <text x="450" y="198" textAnchor="middle" fill="#d9f6ff" fontFamily="ui-monospace, monospace" fontSize="24">
        RECEIPT #{seedTotal % 9999}
      </text>
      <g transform="translate(120 300)">
        <ellipse cx="150" cy="302" rx="110" ry="26" fill="#05080f" opacity=".5" />
        <circle cx="132" cy="106" r="70" fill="#eef9ff" />
        <path d="M72 142c-36 68-30 180 48 214h112c62-56 58-160 26-222-40 30-116 34-186 8z" fill="#e8f6fb" />
        <path d="M82 174c42 34 110 40 174 2" fill="none" stroke="#bad2df" strokeWidth="18" />
        <circle cx="110" cy="104" r="10" fill="#0c1726" />
        <circle cx="154" cy="104" r="10" fill="#0c1726" />
        <path d="M110 138c28 16 58 12 76-10" fill="none" stroke="#0c1726" strokeWidth="8" strokeLinecap="round" />
        <path d="M48 248c-52 48-40 96 12 114" fill="none" stroke="#d8eef7" strokeWidth="28" strokeLinecap="round" />
        <path d="M244 238c70 24 88 78 50 124" fill="none" stroke="#d8eef7" strokeWidth="26" strokeLinecap="round" />
        <circle cx="238" cy="382" r={snowball} fill="url(#snowGlow)" filter="url(#glow)" />
        <path d="M202 356c24-18 58-22 92-8" fill="none" stroke="#fff" strokeWidth="8" opacity=".8" />
      </g>
      <g transform="translate(390 338)">
        {panels.map((_, index) => {
          const x = (index % 2) * 190
          const y = Math.floor(index / 2) * 122
          return (
            <g key={index} transform={`translate(${x} ${y})`}>
              <rect width="166" height="94" rx="10" fill="#0b1524" stroke={accent} strokeWidth="2" opacity=".95" />
              <path d={`M18 24h${62 + ((seedTotal + index * 11) % 56)}M18 46h${86 + ((seedTotal + index * 7) % 42)}M18 68h${48 + ((seedTotal + index * 5) % 70)}`} stroke="#6ee7ff" strokeWidth="5" strokeLinecap="round" opacity=".75" />
              <circle cx="142" cy="24" r="7" fill={index < receipt.steps ? accent : '#31445f'} />
            </g>
          )
        })}
      </g>
      <path d="M178 742C312 646 436 726 558 612s194-52 258-134" fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round" strokeDasharray="18 18" filter="url(#glow)" />
      <g fill="#eafaff" fontFamily="ui-monospace, monospace" fontSize="24">
        <text x="80" y="812">vault {receipt.vaultPercent}%</text>
        <text x="330" y="812">steps {receipt.steps}</text>
        <text x="560" y="812">{receipt.clan ? 'clan yes' : 'solo vault'}</text>
        <text x="80" y="852">{receipt.guard ? 'guard enabled' : 'open flow'}</text>
        <text x="560" y="852">tx {short(receipt.digest)}</text>
      </g>
    </svg>
  )
}

function App() {
  const account = useCurrentAccount()
  const client = useSuiClient()
  const { mutateAsync, isPending } = useSignAndExecuteTransaction()
  const [selectedId, setSelectedId] = useState(recipes[0].id)
  const [amount, setAmount] = useState('0.05')
  const [receipts, setReceipts] = useState<MintedReceipt[]>([])
  const [latestReceipt, setLatestReceipt] = useState<MintedReceipt | null>(null)
  const [error, setError] = useState('')
  const [isLoadingReceipts, setIsLoadingReceipts] = useState(false)

  useEffect(() => {
    const elements = document.querySelectorAll('.reveal-on-scroll')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.16 },
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [receipts.length])

  useEffect(() => {
    let cancelled = false

    async function loadOwnedReceipts() {
      if (!account?.address || !configured) {
        setReceipts([])
        setLatestReceipt(null)
        return
      }

      setIsLoadingReceipts(true)
      setError('')

      try {
        const owned = await client.getOwnedObjects({
          owner: account.address,
          filter: { StructType: RECEIPT_TYPE },
          options: {
            showContent: true,
            showPreviousTransaction: true,
            showType: true,
          },
          limit: 50,
        })

        if (cancelled) return

        const chainReceipts = owned.data
          .map((item) => receiptFromObject(item.data))
          .filter((item): item is MintedReceipt => Boolean(item))
          .sort((a, b) => new Date(b.mintedAt).getTime() - new Date(a.mintedAt).getTime())

        setReceipts((current) => {
          const byReceipt = new Map<string, MintedReceipt>()
          for (const item of [...current, ...chainReceipts]) {
            byReceipt.set(item.receiptId ?? item.digest, item)
          }
          return Array.from(byReceipt.values()).sort((a, b) => new Date(b.mintedAt).getTime() - new Date(a.mintedAt).getTime())
        })
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load receipt history from Sui.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingReceipts(false)
        }
      }
    }

    void loadOwnedReceipts()

    return () => {
      cancelled = true
    }
  }, [account?.address, client])

  const recipe = useMemo(() => recipes.find((item) => item.id === selectedId) ?? recipes[0], [selectedId])
  const previewReceipt: MintedReceipt = {
    ...recipe,
    digest: '0xpreview000000000000000000000000000000000000000000000000000000000000',
    amountMist: mistFromSui(amount || '0'),
    seed: buildSeed(account?.address, recipe, amount),
    mintedAt: new Date().toISOString(),
  }

  async function mintReceipt() {
    setError('')
    if (!account) {
      setError('Connect a Sui wallet first.')
      return
    }
    if (!configured) {
      setError('Package and Studio IDs are not configured yet. Publish the Move package, then update src/config.ts.')
      return
    }

    const amountMist = mistFromSui(amount)
    if (BigInt(amountMist) <= 0n) {
      setError('Enter an amount greater than zero.')
      return
    }

    const tx = new Transaction()
    tx.setGasBudget(80_000_000)
    const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)])
    const seed = buildSeed(account.address, recipe, amount)

    tx.moveCall({
      target: `${PACKAGE_ID}::snowball_studio::split_snowball`,
      arguments: [
        tx.object(STUDIO_ID),
        tx.object(SUI_CLOCK_OBJECT_ID),
        payment,
        tx.pure.string(recipe.name),
        tx.pure.u8(recipe.typeId),
        tx.pure.u8(recipe.steps),
        tx.pure.u8(recipe.vaultPercent),
        tx.pure.bool(recipe.clan),
        tx.pure.bool(recipe.guard),
        tx.pure.vector('u8', seed),
      ],
    })

    const signed = await mutateAsync({ transaction: tx, chain: CHAIN })
    const executed = await client.waitForTransaction({
      digest: signed.digest,
      options: { showObjectChanges: true, showEvents: true },
    })

    const created = executed.objectChanges?.filter((change) => change.type === 'created') ?? []
    const receiptId = created.find((change) => 'objectType' in change && change.objectType.includes('::RecipeReceipt'))?.objectId
    const vaultId = created.find((change) => 'objectType' in change && change.objectType.includes('::PersonalVault'))?.objectId

    const mintedReceipt = {
      ...recipe,
      digest: signed.digest,
      receiptId,
      vaultId,
      amountMist,
      seed,
      mintedAt: new Date().toISOString(),
    }

    setLatestReceipt(mintedReceipt)
    setReceipts((current) => [mintedReceipt, ...current])
  }

  return (
    <main>
      <section className="hero-shell">
        <nav className="topbar" aria-label="Primary">
          <div className="brand">
            <Snowflake size={22} aria-hidden="true" />
            <span>Snowball Studio</span>
          </div>
          <div className="nav-links">
            <a href="#proof">Proof</a>
            <a href="#receipts">Receipts</a>
          </div>
          <ConnectButton />
        </nav>

        <section className="generated-section hero-reference reveal-on-scroll" aria-label="Generated hero design reference">
          <a className="image-link" href="#live-builder" aria-label="Use the live Snowball Studio builder">
            <img src="/art-direction/hero-builder.png" alt="Snowball Studio cinematic hero with Yeti coding room and receipt NFT" />
          </a>
        </section>
        <div className="section-live-actions reveal-on-scroll" aria-label="Live actions for hero section">
          <a href="#live-builder">Use live builder <ArrowUpRight size={15} /></a>
          <a href={explorer('txblock', PROOF_MINT_DIGEST)} target="_blank" rel="noreferrer">Verify proof tx <ArrowUpRight size={15} /></a>
        </div>

        <div className="studio-grid">
          <section className="builder-panel reveal-on-scroll" id="live-builder" aria-labelledby="builder-title">
            <p className="eyebrow">Sui devnet product</p>
            <h1 id="builder-title">Real DeFi moves. Collectible receipts.</h1>
            <p className="lede">
              Split SUI into a vault, mint a receipt object, and render the NFT art from the exact metadata that landed on-chain.
            </p>
            <div className="hero-actions">
              <a className="inline-proof" href={explorer('txblock', PROOF_MINT_DIGEST)} target="_blank" rel="noreferrer">
                View devnet proof <ArrowUpRight size={16} />
              </a>
            </div>

            <div className="recipe-list" role="radiogroup" aria-label="Recipe">
              {recipes.map((item) => (
                <button
                  key={item.id}
                  className={item.id === selectedId ? 'recipe-card active' : 'recipe-card'}
                  onClick={() => setSelectedId(item.id)}
                  role="radio"
                  aria-checked={item.id === selectedId}
                >
                  <span>{item.name}</span>
                  <small>{item.tone}</small>
                </button>
              ))}
            </div>

            <label className="field">
              <span>Amount to route into recipe</span>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
            </label>

            <div className="recipe-stats" aria-label="Selected recipe traits">
              <span><GitBranch size={16} /> {recipe.steps} PTB steps</span>
              <span><LockKeyhole size={16} /> {recipe.vaultPercent}% vaulted</span>
              <span><Shield size={16} /> {recipe.guard ? 'guarded' : 'open'}</span>
              <span><Users size={16} /> {recipe.clan ? 'clan-ready' : 'solo'}</span>
            </div>

            <button className="primary-action" onClick={mintReceipt} disabled={isPending || !account}>
              {isPending ? 'Signing on Sui...' : 'Mint live receipt'}
            </button>
            {latestReceipt && (
              <div className="tx-notice" role="status" aria-live="polite">
                <Bell size={18} aria-hidden="true" />
                <div>
                  <strong>Receipt minted on Sui devnet.</strong>
                  <p>Transaction {short(latestReceipt.digest)} created a unique receipt and vault object.</p>
                </div>
                <a href={explorer('txblock', latestReceipt.digest)} target="_blank" rel="noreferrer">
                  Check tx hash <ArrowUpRight size={15} />
                </a>
                <a href={`#${receiptDomId(latestReceipt.digest)}`}>
                  Preview NFT <Eye size={15} />
                </a>
              </div>
            )}
            {error && <p className="error" role="alert">{error}</p>}
            {!configured && (
              <p className="notice">
                Contract is built locally. Final publish is waiting on testnet gas for
                <code>{short(account?.address)}</code>.
              </p>
            )}
          </section>

          <aside className="art-panel reveal-on-scroll" aria-label="NFT preview">
            <p className="art-label">Generated receipt art</p>
            <ReceiptArt receipt={receipts[0] ?? previewReceipt} />
          </aside>
        </div>
      </section>

      <section className="proof-band" id="proof" aria-labelledby="proof-title">
        <div className="generated-section proof-reference reveal-on-scroll" aria-label="Generated object proof design reference">
          <a className="image-link" href={explorer('txblock', PROOF_MINT_DIGEST)} target="_blank" rel="noreferrer" aria-label="Inspect the live mint transaction">
            <img src="/art-direction/object-proof.png" alt="Object proof diagram showing transaction, Studio, PersonalVault, RecipeReceipt, and event" />
          </a>
        </div>
        <div className="proof-copy">
          <p className="eyebrow">Object proof</p>
          <h2 id="proof-title">Every receipt leaves object changes.</h2>
          <p>Studio, vault, receipt, and event are separate inspectable artifacts on Sui devnet.</p>
        </div>
        <div className="proof-grid">
          <div><BadgeCheck size={18} /> Real Move package</div>
          <div><Clock3 size={18} /> Clock-stamped receipt</div>
          <div><LockKeyhole size={18} /> SUI locked in vault object</div>
        </div>
      </section>
      <div className="section-live-actions proof-actions reveal-on-scroll" aria-label="Live actions for object proof section">
        <a href={explorer('txblock', PROOF_MINT_DIGEST)} target="_blank" rel="noreferrer">Inspect live mint <ArrowUpRight size={15} /></a>
        <a href={explorer('object', PROOF_RECEIPT_ID)} target="_blank" rel="noreferrer">Open receipt object <ArrowUpRight size={15} /></a>
        <a href={explorer('object', PROOF_VAULT_ID)} target="_blank" rel="noreferrer">Open vault object <ArrowUpRight size={15} /></a>
      </div>

      <section className="generated-section devnet-reference reveal-on-scroll" aria-label="Generated devnet proof design reference">
        <a className="image-link" href={explorer('txblock', PUBLISH_DIGEST)} target="_blank" rel="noreferrer" aria-label="Open the live publish transaction">
          <img src="/art-direction/devnet-proof.png" alt="Devnet proof section with publish transaction, package, studio object, mint proof, and receipt links" />
        </a>
      </section>

      <section className="chain-proof" aria-label="Live deployment proof">
        <p className="proof-rail">devnet verified</p>
        <a href={explorer('txblock', PUBLISH_DIGEST)} target="_blank" rel="noreferrer">
          Publish tx <span>{short(PUBLISH_DIGEST)}</span> <ArrowUpRight size={16} />
        </a>
        <a href={explorer('object', PACKAGE_ID)} target="_blank" rel="noreferrer">
          Package <span>{short(PACKAGE_ID)}</span> <ArrowUpRight size={16} />
        </a>
        <a href={explorer('object', STUDIO_ID)} target="_blank" rel="noreferrer">
          Shared Studio <span>{short(STUDIO_ID)}</span> <ArrowUpRight size={16} />
        </a>
        <a href={explorer('txblock', PROOF_MINT_DIGEST)} target="_blank" rel="noreferrer">
          Live mint proof <span>{short(PROOF_MINT_DIGEST)}</span> <ArrowUpRight size={16} />
        </a>
        <a href={explorer('object', PROOF_RECEIPT_ID)} target="_blank" rel="noreferrer">
          Proof receipt <span>{short(PROOF_RECEIPT_ID)}</span> <ArrowUpRight size={16} />
        </a>
      </section>

      <section className="receipts" id="receipts" aria-label="Minted receipts">
        <div className="generated-section receipt-reference reveal-on-scroll" aria-label="Generated receipt gallery design reference">
          <a className="image-link" href="#live-builder" aria-label="Connect wallet and mint a receipt">
            <img src="/art-direction/receipt-gallery.png" alt="Receipt gallery section with collectible receipt cards and wallet call to action" />
          </a>
        </div>
        <div className="section-live-actions receipt-actions reveal-on-scroll" aria-label="Live actions for receipt gallery section">
          <a href="#live-builder">Connect wallet and mint <ArrowUpRight size={15} /></a>
          <a href={explorer('object', PACKAGE_ID)} target="_blank" rel="noreferrer">Read Move package <ArrowUpRight size={15} /></a>
        </div>
        <div className="receipt-header">
          <div>
            <p className="eyebrow">Receipt gallery</p>
            <h2>Mint the proof. Keep the artifact.</h2>
            <p className="history-note">
              {account
                ? isLoadingReceipts
                  ? 'Loading your owned RecipeReceipt objects from Sui devnet...'
                  : `${receipts.length} receipt${receipts.length === 1 ? '' : 's'} loaded from your wallet.`
                : 'Connect a devnet wallet to reload your receipt history from chain.'}
            </p>
          </div>
          <a href={explorer('object', PACKAGE_ID)} target="_blank" rel="noreferrer">
            Read the Move package <ArrowUpRight size={16} />
          </a>
        </div>
        {receipts.length === 0 ? (
          <div className="empty-state">
            <h2>{isLoadingReceipts ? 'Searching Sui for receipts...' : 'No live receipts yet.'}</h2>
            <p>{isLoadingReceipts ? 'Snowball Studio is querying owned RecipeReceipt objects for the connected wallet.' : 'Connect a devnet wallet and sign a recipe transaction. Your freshly minted receipt NFT and vault object will appear here with explorer links.'}</p>
          </div>
        ) : (
          receipts.map((item) => (
            <article className="minted-card reveal-on-scroll" id={receiptDomId(item.digest)} key={item.digest}>
              <ReceiptArt receipt={item} />
              <div>
                <h2>{item.name}</h2>
                <p>Minted {new Date(item.mintedAt).toLocaleString()} with {item.vaultPercent}% of the payment locked in a personal vault.</p>
                <a href={explorer('txblock', item.digest)} target="_blank" rel="noreferrer">
                  View transaction <ArrowUpRight size={16} />
                </a>
                {item.receiptId && <a href={explorer('object', item.receiptId)} target="_blank" rel="noreferrer">Receipt object {short(item.receiptId)}</a>}
                {item.vaultId && <a href={explorer('object', item.vaultId)} target="_blank" rel="noreferrer">Vault object {short(item.vaultId)}</a>}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  )
}

export default App
