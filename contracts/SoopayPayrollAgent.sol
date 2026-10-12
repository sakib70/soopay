// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SoopayPayrollAgent
 * @notice Onchain registry for Soopay payroll agent configuration.
 *
 * Stores a keccak256 commitment of the agent schedule so the off-chain agent
 * can prove its instructions are immutable and auditable onchain.
 * Does NOT hold funds. Does NOT execute payments. Does NOT store email addresses
 * or private data — only a hash commitment and a public metadata URI.
 *
 * One schedule per owner address. Owner can update or revoke at any time.
 */

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SoopayPayrollAgent is ReentrancyGuard {

    // ── Events ────────────────────────────────────────────────────────────────

    event ScheduleRegistered(
        address indexed owner,
        bytes32 indexed configHash,
        string  metadataURI,
        uint256 payrollDay,    // 1-31, day of month
        uint256 alertDaysBefore,
        uint256 registeredAt
    );

    event ScheduleUpdated(
        address indexed owner,
        bytes32 indexed oldHash,
        bytes32 indexed newHash,
        uint256 updatedAt
    );

    event ScheduleRevoked(
        address indexed owner,
        bytes32 indexed configHash,
        uint256 revokedAt
    );

    // ── Storage ───────────────────────────────────────────────────────────────

    struct AgentSchedule {
        bytes32 configHash;       // keccak256 of off-chain config JSON
        string  metadataURI;      // HTTPS/IPFS URI to agent card (public metadata only)
        uint256 payrollDay;       // day of month (1-31)
        uint256 alertDaysBefore;  // how many days in advance to send the alert
        bool    active;
        uint256 registeredAt;
        uint256 updatedAt;
    }

    mapping(address => AgentSchedule) private _schedules;
    address[] private _owners;

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier validDay(uint256 day) {
        require(day >= 1 && day <= 31, "SoopayPayrollAgent: day must be 1-31");
        _;
    }

    modifier validAlert(uint256 days_) {
        require(days_ >= 1 && days_ <= 30, "SoopayPayrollAgent: alertDaysBefore must be 1-30");
        _;
    }

    // ── External functions ────────────────────────────────────────────────────

    /**
     * @notice Register or update the caller's payroll agent schedule.
     * @param configHash      keccak256 commitment of the off-chain schedule JSON.
     * @param metadataURI     Public URI to agent metadata (no PII).
     * @param payrollDay      Day of month for payroll execution (1-31).
     * @param alertDaysBefore Days before payroll day to send the email alert.
     */
    function register(
        bytes32 configHash,
        string  calldata metadataURI,
        uint256 payrollDay,
        uint256 alertDaysBefore
    )
        external
        nonReentrant
        validDay(payrollDay)
        validAlert(alertDaysBefore)
    {
        require(configHash != bytes32(0), "SoopayPayrollAgent: zero hash");
        require(bytes(metadataURI).length > 0, "SoopayPayrollAgent: empty URI");

        AgentSchedule storage s = _schedules[msg.sender];
        bool isNew = (s.registeredAt == 0);

        if (isNew) {
            _owners.push(msg.sender);
            emit ScheduleRegistered(
                msg.sender, configHash, metadataURI,
                payrollDay, alertDaysBefore, block.timestamp
            );
        } else {
            emit ScheduleUpdated(msg.sender, s.configHash, configHash, block.timestamp);
        }

        s.configHash      = configHash;
        s.metadataURI     = metadataURI;
        s.payrollDay      = payrollDay;
        s.alertDaysBefore = alertDaysBefore;
        s.active          = true;
        s.updatedAt       = block.timestamp;
        if (isNew) s.registeredAt = block.timestamp;
    }

    /**
     * @notice Revoke the caller's schedule (deactivate without deleting history).
     */
    function revoke() external nonReentrant {
        AgentSchedule storage s = _schedules[msg.sender];
        require(s.registeredAt != 0, "SoopayPayrollAgent: no schedule");
        require(s.active, "SoopayPayrollAgent: already inactive");
        s.active    = false;
        s.updatedAt = block.timestamp;
        emit ScheduleRevoked(msg.sender, s.configHash, block.timestamp);
    }

    // ── View functions ────────────────────────────────────────────────────────

    function getSchedule(address owner) external view returns (AgentSchedule memory) {
        return _schedules[owner];
    }

    function isRegistered(address owner) external view returns (bool) {
        return _schedules[owner].active;
    }

    function totalRegistered() external view returns (uint256) {
        return _owners.length;
    }
}
