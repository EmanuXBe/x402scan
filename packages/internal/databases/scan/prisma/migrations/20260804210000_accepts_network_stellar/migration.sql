-- Stellar support: resources can advertise payment on Stellar pubnet/testnet.
ALTER TYPE "AcceptsNetwork" ADD VALUE IF NOT EXISTS 'stellar';
ALTER TYPE "AcceptsNetwork" ADD VALUE IF NOT EXISTS 'stellar_testnet';
