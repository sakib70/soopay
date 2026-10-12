// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SoopayPayroll
 * @notice Batch-pays employees in USDC or cirBTC.
 *
 * Design principles
 * -----------------
 * - Only two whitelisted tokens (USDC, cirBTC) can be used.
 * - Funds are NEVER held by this contract. The employer grants an allowance;
 *   batchPay pulls per-recipient and delivers in one loop.
 * - Transfers are isolated: if one recipient's transfer fails (e.g. a token
 *   blocklist), that slot is skipped and a SkippedPayment event is emitted.
 *   All other recipients still receive their payment in the same call.
 * - No employee records, salaries, or FX logic live on-chain.
 * - Maximum batch size: 100 recipients per call.
 * - The owner can add/remove allowed tokens.
 *
 * Security
 * --------
 * - ReentrancyGuard on all external state-changing functions.
 * - SafeERC20 for all token transfers.
 * - Per-recipient isolation via low-level try/catch on each transfer.
 * - Input validation: array lengths must match, batch ≤ 100, no zero-address
 *   recipient, no zero-amount payment, token must be whitelisted.
 * - No owner-withdrawal path — the contract holds no funds.
 */
contract SoopayPayroll is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Maximum recipients in a single batch call.
    uint256 public constant MAX_BATCH_SIZE = 100;

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice Tokens permitted for distribution.
    mapping(address => bool) public allowedTokens;

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted after a successful batch execution (counts successful payments only).
    event BatchPaid(
        address indexed payer,
        address indexed token,
        uint256 successCount,
        uint256 totalPaid
    );

    /// @notice Emitted for each recipient whose payment succeeded.
    event PaymentSent(
        address indexed payer,
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    /// @notice Emitted when a single recipient's transfer fails (batch continues).
    event SkippedPayment(
        address indexed payer,
        address indexed token,
        address indexed recipient,
        uint256 amount,
        string reason
    );

    /// @notice Emitted when a token is added/removed from the whitelist.
    event TokenAllowanceUpdated(address indexed token, bool allowed);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error TokenNotAllowed(address token);
    error ArrayLengthMismatch();
    error BatchTooLarge(uint256 size, uint256 max);
    error EmptyBatch();
    error ZeroRecipient(uint256 index);
    error ZeroAmount(uint256 index);
    error ZeroTokenAddress();
    error TokenAlreadyConfigured();

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param initialOwner  Address that receives the Ownable role.
     * @param usdc          USDC contract address (required, non-zero).
     * @param cirBtc        cirBTC contract address. Pass address(0) if not yet
     *                      known; add it later via addAllowedToken.
     */
    constructor(
        address initialOwner,
        address usdc,
        address cirBtc
    ) Ownable(initialOwner) {
        if (usdc == address(0)) revert ZeroTokenAddress();
        allowedTokens[usdc] = true;
        emit TokenAllowanceUpdated(usdc, true);

        if (cirBtc != address(0)) {
            allowedTokens[cirBtc] = true;
            emit TokenAllowanceUpdated(cirBtc, true);
        }
    }

    // ─── Owner management ─────────────────────────────────────────────────────

    /// @notice Add a new token to the whitelist.
    function addAllowedToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroTokenAddress();
        if (allowedTokens[token]) revert TokenAlreadyConfigured();
        allowedTokens[token] = true;
        emit TokenAllowanceUpdated(token, true);
    }

    /// @notice Remove a token from the whitelist.
    function removeAllowedToken(address token) external onlyOwner {
        if (!allowedTokens[token]) revert TokenAlreadyConfigured();
        allowedTokens[token] = false;
        emit TokenAllowanceUpdated(token, false);
    }

    // ─── Core function ────────────────────────────────────────────────────────

    /**
     * @notice Distribute `token` to multiple recipients.
     *
     * The caller (employer) must have approved this contract for at least the
     * sum of all amounts (or individually approved amounts per-recipient, since
     * this contract pulls per-recipient).
     *
     * Each transfer is isolated: a failed transfer for one recipient emits
     * SkippedPayment and the batch continues, preserving payment for all others.
     *
     * @param token       Whitelisted ERC-20 to distribute.
     * @param recipients  Recipient addresses (max 100, each non-zero).
     * @param amounts     Raw token amounts (same length as recipients, each > 0).
     * @return successCount  Number of recipients successfully paid.
     * @return totalPaid     Sum of amounts actually transferred.
     */
    function batchPay(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external nonReentrant returns (uint256 successCount, uint256 totalPaid) {
        // ── Validation ────────────────────────────────────────────────────────
        if (!allowedTokens[token]) revert TokenNotAllowed(token);
        if (recipients.length == 0) revert EmptyBatch();
        if (recipients.length != amounts.length) revert ArrayLengthMismatch();
        if (recipients.length > MAX_BATCH_SIZE)
            revert BatchTooLarge(recipients.length, MAX_BATCH_SIZE);

        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroRecipient(i);
            if (amounts[i] == 0) revert ZeroAmount(i);
        }

        // ── Per-recipient pull-and-push ────────────────────────────────────────
        // Pull each amount individually from the payer so that a failure on one
        // recipient (e.g. a token blocklist hit on transferFrom) can be caught
        // and skipped without affecting the rest of the batch.
        IERC20 erc20 = IERC20(token);
        address payer = msg.sender;

        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            uint256 amount = amounts[i];

            // Pull from payer → this contract
            try erc20.transferFrom(payer, address(this), amount) returns (bool ok1) {
                if (!ok1) {
                    emit SkippedPayment(payer, token, recipient, amount, "transferFrom returned false");
                    continue;
                }
            } catch Error(string memory reason) {
                emit SkippedPayment(payer, token, recipient, amount, reason);
                continue;
            } catch {
                emit SkippedPayment(payer, token, recipient, amount, "transferFrom reverted");
                continue;
            }

            // Push from this contract → recipient
            try erc20.transfer(recipient, amount) returns (bool ok2) {
                if (!ok2) {
                    // Transfer failed after pull — refund payer
                    erc20.safeTransfer(payer, amount);
                    emit SkippedPayment(payer, token, recipient, amount, "transfer returned false");
                    continue;
                }
            } catch Error(string memory reason) {
                erc20.safeTransfer(payer, amount);
                emit SkippedPayment(payer, token, recipient, amount, reason);
                continue;
            } catch {
                erc20.safeTransfer(payer, amount);
                emit SkippedPayment(payer, token, recipient, amount, "transfer reverted");
                continue;
            }

            emit PaymentSent(payer, token, recipient, amount);
            successCount++;
            totalPaid += amount;
        }

        emit BatchPaid(payer, token, successCount, totalPaid);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    /// @notice Returns whether the given token is whitelisted.
    function isTokenAllowed(address token) external view returns (bool) {
        return allowedTokens[token];
    }
}
