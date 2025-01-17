import base64url from 'base64url'
import { formatProofForSnarkjsVerification } from '@unirep/circuits'
import { EpochKeyProof, Unirep, UnirepFactory } from '@unirep/contracts'

import { DEFAULT_ETH_PROVIDER } from './defaults'
import { epkProofPrefix, epkPublicSignalsPrefix } from './prefix'
import { getProvider } from './utils'
import { ethers } from 'ethers'

const configureSubparser = (subparsers: any) => {
    const parser = subparsers.add_parser('submitEpochKeyProof', {
        add_help: true,
    })

    parser.add_argument('-e', '--eth-provider', {
        action: 'store',
        type: 'str',
        help: `A connection string to an Ethereum provider. Default: ${DEFAULT_ETH_PROVIDER}`,
    })

    parser.add_argument('-p', '--public-signals', {
        required: true,
        type: 'str',
        help: "The snark public signals of the user's epoch key ",
    })

    parser.add_argument('-pf', '--proof', {
        required: true,
        type: 'str',
        help: "The snark proof of the user's epoch key ",
    })

    parser.add_argument('-x', '--contract', {
        required: true,
        type: 'str',
        help: 'The Unirep contract address',
    })

    parser.add_argument('-d', '--eth-privkey', {
        required: true,
        action: 'store',
        type: 'str',
        help: "The attester's Ethereum private key",
    })
}

const submitEpochKeyProof = async (args: any) => {
    // Ethereum provider
    const ethProvider = args.eth_provider ?? DEFAULT_ETH_PROVIDER
    const provider = getProvider(ethProvider)

    // Unirep contract
    const unirepContract: Unirep = UnirepFactory.connect(
        args.contract,
        provider
    )
    const currentEpoch = Number(await unirepContract.currentEpoch())

    const decodedProof = base64url.decode(
        args.proof.slice(epkProofPrefix.length)
    )
    const decodedPublicSignals = base64url.decode(
        args.public_signals.slice(epkPublicSignalsPrefix.length)
    )
    const proof = JSON.parse(decodedProof)
    const publicSignals = JSON.parse(decodedPublicSignals)
    const epochKeyProof = new EpochKeyProof(
        publicSignals,
        formatProofForSnarkjsVerification(proof)
    )
    const inputEpoch = epochKeyProof.epoch
    console.log(
        `Submit epoch key ${epochKeyProof.epochKey} with GSTRoot ${epochKeyProof.globalStateTree} in epoch ${inputEpoch}`
    )
    if (inputEpoch != currentEpoch) {
        console.log(
            `Warning: the epoch key is expired. Epoch key is in epoch ${inputEpoch}, but the current epoch is ${currentEpoch}`
        )
    }

    // Connect a signer
    const wallet = new ethers.Wallet(args.eth_privkey, provider)

    // Submit epoch key proof
    let tx: ethers.ContractTransaction
    try {
        tx = await unirepContract
            .connect(wallet)
            .submitEpochKeyProof(epochKeyProof)
        await tx.wait()
    } catch (error) {
        console.log('Transaction Error', error)
        return
    }
    const proofIndex = await unirepContract.getProofIndex(epochKeyProof.hash())

    console.log('Transaction hash:', tx?.hash)
    console.log('Proof index: ', proofIndex.toNumber())
}

export { submitEpochKeyProof, configureSubparser }
