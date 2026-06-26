import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { ArrowUpRight, BadgeCheck, Bell, Check, Clock3, Eye, GitBranch, LockKeyhole, Shield, Snowflake, UnlockKeyhole, Users } from 'lucide-react'
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
  intent: string
  flow: string
  outcome: string
}

type MintedReceipt = Recipe & {
  digest: string
  receiptId?: string
  vaultId?: string
  amountMist: string
  seed: number[]
  mintedAt: string
  vaultWithdrawn?: boolean
  withdrawnDigest?: string
  withdrawnAt?: string
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
    intent: 'Best for solo builders who want to save part of a devnet SUI deposit and prove the split happened.',
    flow: 'Your selected SUI is split once: 60% enters a wallet-owned PersonalVault, 40% comes back liquid.',
    outcome: 'Mints a RecipeReceipt NFT with vault percent, amount, timestamp, guard flag, and art seed.',
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
    intent: 'Best for a team or community treasury moment where the receipt should signal shared coordination.',
    flow: 'Your selected SUI is split once: 45% enters your PersonalVault, 55% comes back liquid, and the receipt is clan-marked.',
    outcome: 'Mints a clan-ready RecipeReceipt NFT that can be shown as contribution proof.',
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
    intent: 'Best for a stricter savings action where most of the routed devnet SUI should be held aside.',
    flow: 'Your selected SUI is split once: 80% enters a wallet-owned PersonalVault, 20% comes back liquid.',
    outcome: 'Mints a guarded RecipeReceipt NFT with a stronger vault signal in the generated art.',
  },
]

const configured = PACKAGE_ID.startsWith('0x') && STUDIO_ID.startsWith('0x')
const RECEIPT_TYPE = `${PACKAGE_ID}::snowball_studio::RecipeReceipt`
const VAULT_TYPE = `${PACKAGE_ID}::snowball_studio::PersonalVault`

function mistFromSui(input: string) {
  const [whole = '0', fraction = ''] = input.trim().split('.')
  const padded = `${fraction}000000000`.slice(0, 9)
  return (BigInt(whole || '0') * 1_000_000_000n + BigInt(padded || '0')).toString()
}

function safeMistFromSui(input: string) {
  const trimmed = input.trim()
  if (!/^\d+(\.\d{0,9})?$/.test(trimmed)) return null

  try {
    return mistFromSui(trimmed)
  } catch {
    return null
  }
}

function formatSuiFromMist(input: string) {
  const mist = BigInt(input)
  const whole = mist / 1_000_000_000n
  const fraction = (mist % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '')
  return `${whole.toString()}${fraction ? `.${fraction}` : ''} SUI`
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
  const route = path === 'txblock' ? 'tx' : 'object'
  return `${EXPLORER_BASE}/${NETWORK}/${route}/${id}`
}

const receiptArtSources = [
  { src: '/art-direction/hero-builder.png', label: 'Yeti Coding HQ' },
  { src: '/art-direction/object-proof.png', label: 'Object Proof Wall' },
  { src: '/art-direction/devnet-proof.png', label: 'Devnet Control Room' },
  { src: '/art-direction/receipt-gallery.png', label: 'Receipt Gallery' },
]

const receiptCrops = ['center', 'left center', 'right center', 'center top', 'center bottom']
const receiptFrames = ['cyan', 'mint', 'pink', 'ice']

function seedAt(seed: number[], index: number, fallback = 0) {
  return seed.length > 0 ? seed[index % seed.length] : fallback
}

function receiptVisualTraits(receipt: MintedReceipt) {
  const seedTotal = receipt.seed.reduce((sum, value) => sum + value, 0)
  const sourceIndex = (seedTotal + receipt.typeId + receipt.steps) % receiptArtSources.length
  const cropIndex = (seedAt(receipt.seed, 3) + receipt.vaultPercent) % receiptCrops.length
  const frameIndex = (seedAt(receipt.seed, 7) + receipt.typeId) % receiptFrames.length
  const tilt = (seedAt(receipt.seed, 11) % 7) - 3
  const zoom = 1.04 + ((seedAt(receipt.seed, 17) % 7) / 100)

  return {
    source: receiptArtSources[sourceIndex],
    crop: receiptCrops[cropIndex],
    frame: receiptFrames[frameIndex],
    tilt,
    zoom,
    serial: seedTotal % 9999,
    variant: `${sourceIndex + 1}.${cropIndex + 1}.${frameIndex + 1}`,
  }
}

function ReceiptArt({ receipt }: { receipt: MintedReceipt }) {
  const traits = receiptVisualTraits(receipt)

  return (
    <article className={`receipt-art frame-${traits.frame}`} aria-label={`${receipt.name} receipt NFT preview`}>
      <div className="receipt-art-topline">
        <span>{receipt.digest.startsWith('0xpreview') ? 'Preview' : 'Latest'}</span>
        <strong><Check size={18} /> Minted</strong>
      </div>
      <h3>{receipt.name}</h3>
      <p>Receipt #{traits.serial} / Variant {traits.variant}</p>
      <div className="receipt-image-shell" style={{ transform: `rotate(${traits.tilt}deg)` }}>
        <img
          src={traits.source.src}
          alt={`${receipt.name} ${traits.source.label} artwork`}
          style={{ objectPosition: traits.crop, transform: `scale(${traits.zoom})` }}
        />
        <span>{traits.source.label}</span>
      </div>
      <dl className="receipt-proof-list">
        <div>
          <dt>Transaction digest</dt>
          <dd>{short(receipt.digest)}</dd>
        </div>
        <div>
          <dt>Receipt object</dt>
          <dd>{receipt.receiptId ? short(receipt.receiptId) : 'created after mint'}</dd>
        </div>
        <div>
          <dt>Vault object</dt>
          <dd>{receipt.vaultWithdrawn ? 'withdrawn' : receipt.vaultId ? short(receipt.vaultId) : 'created after mint'}</dd>
        </div>
        <div>
          <dt>Move package</dt>
          <dd>{short(PACKAGE_ID)}</dd>
        </div>
        <div>
          <dt>Minted on</dt>
          <dd>{new Date(receipt.mintedAt).toLocaleString()}</dd>
        </div>
      </dl>
    </article>
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
  const [withdrawingVaultId, setWithdrawingVaultId] = useState<string | null>(null)

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
        const ownedVaults = await client.getOwnedObjects({
          owner: account.address,
          filter: { StructType: VAULT_TYPE },
          options: { showType: true },
          limit: 50,
        })
        const ownedVaultIds = new Set(ownedVaults.data.map((item) => item.data?.objectId).filter((item): item is string => Boolean(item)))

        if (cancelled) return

        const chainReceipts = owned.data
          .map((item) => receiptFromObject(item.data))
          .filter((item): item is MintedReceipt => Boolean(item))
          .map((item) => ({
            ...item,
            vaultWithdrawn: Boolean(item.vaultId && !ownedVaultIds.has(item.vaultId)),
          }))
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
  const previewAmountMist = safeMistFromSui(amount) ?? '0'
  const vaultedMist = (BigInt(previewAmountMist) * BigInt(recipe.vaultPercent) / 100n).toString()
  const liquidMist = (BigInt(previewAmountMist) - BigInt(vaultedMist)).toString()
  const previewReceipt: MintedReceipt = {
    ...recipe,
    digest: '0xpreview000000000000000000000000000000000000000000000000000000000000',
    amountMist: previewAmountMist,
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

    const amountMist = safeMistFromSui(amount)
    if (!amountMist) {
      setError('Enter a valid SUI amount with up to 9 decimals, like 0.05.')
      return
    }
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
      vaultWithdrawn: false,
    }

    setLatestReceipt(mintedReceipt)
    setReceipts((current) => [mintedReceipt, ...current])
  }

  async function withdrawVault(receipt: MintedReceipt) {
    setError('')

    if (!account) {
      setError('Connect the wallet that owns this PersonalVault first.')
      return
    }
    if (!receipt.vaultId || receipt.vaultWithdrawn) {
      setError('This receipt does not have an active vault to withdraw.')
      return
    }

    setWithdrawingVaultId(receipt.vaultId)

    try {
      const tx = new Transaction()
      tx.setGasBudget(50_000_000)
      tx.moveCall({
        target: `${PACKAGE_ID}::snowball_studio::withdraw_personal_vault`,
        arguments: [tx.object(receipt.vaultId)],
      })

      const signed = await mutateAsync({ transaction: tx, chain: CHAIN })
      await client.waitForTransaction({ digest: signed.digest })

      setLatestReceipt((current) => {
        if (!current || current.vaultId !== receipt.vaultId) return current
        return { ...current, vaultWithdrawn: true, withdrawnDigest: signed.digest, withdrawnAt: new Date().toISOString() }
      })
      setReceipts((current) => current.map((item) => item.vaultId === receipt.vaultId
        ? { ...item, vaultWithdrawn: true, withdrawnDigest: signed.digest, withdrawnAt: new Date().toISOString() }
        : item))
    } catch (withdrawError) {
      setError(withdrawError instanceof Error ? withdrawError.message : 'Could not withdraw this vault.')
    } finally {
      setWithdrawingVaultId(null)
    }
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
              Choose how devnet SUI should be split before you sign. The app sends one real Sui transaction that creates a vault object, a receipt NFT, and explorer-verifiable object changes.
            </p>
            <div className="transaction-disclaimer" role="note">
              <strong>What you are transacting:</strong>
              <span>This uses Sui devnet tokens only. You are not paying Snowball Studio; your wallet signs a Move call that routes your own devnet SUI and pays normal devnet gas.</span>
            </div>
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
                  <span className="recipe-card-title">{item.name}</span>
                  <small>{item.intent}</small>
                  <span className="recipe-card-flow">{item.flow}</span>
                  <span className="recipe-card-meta">
                    <strong>{item.vaultPercent}% vault</strong>
                    <strong>{100 - item.vaultPercent}% liquid</strong>
                    <strong>{item.steps} PTB steps</strong>
                  </span>
                </button>
              ))}
            </div>

            <label className="field">
              <span>Amount to route into recipe</span>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
            </label>

            <section className="signing-brief" aria-label="Transaction breakdown before signing">
              <div>
                <span>You sign</span>
                <strong>split_snowball Move call</strong>
                <small>One programmable transaction block on Sui devnet.</small>
              </div>
              <div>
                <span>Routed amount</span>
                <strong>{formatSuiFromMist(previewAmountMist)}</strong>
                <small>The amount selected above, before devnet gas.</small>
              </div>
              <div>
                <span>Locked in your vault</span>
                <strong>{formatSuiFromMist(vaultedMist)}</strong>
                <small>A PersonalVault object owned by your wallet.</small>
              </div>
              <div>
                <span>Returned liquid</span>
                <strong>{formatSuiFromMist(liquidMist)}</strong>
                <small>The remainder is returned to your wallet as SUI.</small>
              </div>
              <div>
                <span>NFT created</span>
                <strong>RecipeReceipt</strong>
                <small>Artwork is generated from the receipt metadata after mint.</small>
              </div>
            </section>

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
                <div className={item.vaultWithdrawn ? 'vault-status withdrawn' : 'vault-status'}>
                  <LockKeyhole size={16} />
                  <span>
                    {item.vaultWithdrawn
                      ? 'Vault withdrawn. The locked devnet SUI was returned to the owner wallet.'
                      : `Active vault holds ${formatSuiFromMist((BigInt(item.amountMist) * BigInt(item.vaultPercent) / 100n).toString())}.`}
                  </span>
                </div>
                <a href={explorer('txblock', item.digest)} target="_blank" rel="noreferrer">
                  View transaction <ArrowUpRight size={16} />
                </a>
                {item.receiptId && <a href={explorer('object', item.receiptId)} target="_blank" rel="noreferrer">Receipt object {short(item.receiptId)}</a>}
                {item.vaultId && <a href={explorer('object', item.vaultId)} target="_blank" rel="noreferrer">Vault object {short(item.vaultId)}</a>}
                {item.withdrawnDigest && (
                  <a href={explorer('txblock', item.withdrawnDigest)} target="_blank" rel="noreferrer">
                    Withdrawal tx {short(item.withdrawnDigest)}
                  </a>
                )}
                {item.vaultId && !item.vaultWithdrawn && (
                  <button
                    className="withdraw-action"
                    disabled={isPending || withdrawingVaultId === item.vaultId}
                    onClick={() => void withdrawVault(item)}
                  >
                    <UnlockKeyhole size={16} />
                    {withdrawingVaultId === item.vaultId ? 'Withdrawing vault...' : 'Withdraw locked SUI'}
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  )
}

export default App
