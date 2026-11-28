# Backup encryption

The weekly backup validates the PostgreSQL archive, then encrypts it with age before uploading it to the existing private `kidease-db-backups` bucket. The quarterly rehearsal downloads the newest encrypted weekly object, authenticates and decrypts it, then restores into a disposable PostgreSQL container. An absent key, authentication failure, incomplete restore, or missing required data fails the job.

## Setup and key custody

Generate a dedicated X25519 key pair with `age-keygen` on a trusted computer. Save the identity in the approved backup vault with a separate recovery copy and access limited to designated recovery operators.

- Set `BACKUP_ENCRYPTION_PUBLIC_KEY` to the `age1...` recipient. The backup job receives this secret.
- Set `BACKUP_ENCRYPTION_IDENTITY` to the matching `AGE-SECRET-KEY-...` identity. The restore job receives this secret.
- Use the existing R2 bucket and credentials. Update any lifecycle or monitoring filters that match the old suffix to include `weekly/YYYY-MM-DD.dump.age` and `monthly/YYYY-MM.dump.age`. Preserve existing plaintext objects under the existing retention policy pending owner review.

After configuration, run the backup manually, verify the encrypted weekly object exists, then run the restore rehearsal. The restore workflow deliberately selects encrypted archives only.

## Rotate and recover

Record the rotation date and recipient in the vault. Keep previous identities in the vault for as long as any backup encrypted to them remains in retention. Coordinate the recipient and identity secret updates, make a new encrypted backup, and confirm a restore rehearsal succeeds before closing the rotation.

If the new key fails, restore the previous matched secret pair and run a new encrypted backup and rehearsal. Keep both identities and confirm recoverability for objects written during the transition. For manual recovery, download the selected encrypted object to restricted storage and run `age --decrypt --identity /secure/path/to/identity --output db.dump db.dump.age`. Validate with `pg_restore --list` and rehearse in isolated PostgreSQL before any separately approved production recovery. Remove local copies after recovery.
