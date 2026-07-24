export const TRANSFER_EXECUTION_SCOPE = Object.freeze({
    PENDING: 'pending',
    RETRY: 'retry',
    PENDING_AND_ERRORS: 'pending-and-errors'
})

export const isSpecialTransferScope = scope => scope !== TRANSFER_EXECUTION_SCOPE.PENDING

export const isExecutableTransferStatus = (status, scope = TRANSFER_EXECUTION_SCOPE.PENDING) => {
    if (scope === TRANSFER_EXECUTION_SCOPE.RETRY) {
        return status === 'Error' || status === 'ValidationError'
    }
    if (scope === TRANSFER_EXECUTION_SCOPE.PENDING_AND_ERRORS) {
        return status === 'Pending' || status === 'Error' || status === 'ValidationError'
    }
    return status === 'Pending'
}
