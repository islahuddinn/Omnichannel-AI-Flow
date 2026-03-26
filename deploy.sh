#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status
LOG_FILE="/var/www/deploy-mongo.log"
WORKDIR="/var/www/omni-mongo"
REPO_URL="https://git-codecommit.eu-north-1.amazonaws.com/v1/repos/omnichannel-mongo"
ENV_FILE="/home/omni-mongo-env.env"

# Activate virtual environment
cd /var/www
echo "Activating virtual environment..." >> $LOG_FILE
source myenv/bin/activate || { echo "Failed to activate virtual environment" >> $LOG_FILE; exit 1; }

echo "Using git-remote-codecommit: $(which git-remote-codecommit)" >> $LOG_FILE
echo "Current directory: $(pwd)" >> $LOG_FILE

# Kill any running Node.js processes
echo "Checking for running Node.js processes..." >> $LOG_FILE
pm2 stop omni-mongo



# Remove the old application folder
echo "Removing old application folder..." >> $LOG_FILE
sudo rm -rf $WORKDIR || { echo "Failed to remove $WORKDIR" >> $LOG_FILE; exit 1; }
echo "Removed $WORKDIR successfully." >> $LOG_FILE

echo "Configuring Git for CodeCommit..." >> $LOG_FILE


# Clone the repository
echo "Cloning repository..." >> $LOG_FILE
sudo git clone https://git-codecommit.eu-north-1.amazonaws.com/v1/repos/omnichannel-mongo $WORKDIR || { echo "Failed to clone repository from $REPO_URL" >> $LOG_FILE; exit 1; }

sudo chown ubuntu:ubuntu -R $WORKDIR
sudo chmod 777 -R $WORKDIR
# Navigate to the application folder
cd $WORKDIR || { echo "Failed to navigate to $WORKDIR" >> $LOG_FILE; exit 1; }
echo "Current directory: $(pwd)" >> $LOG_FILE

# Check hostname and checkout appropriate branch
hostname=$(hostname)
echo "Hostname: $hostname" >> $LOG_FILE
if [ "$hostname" == "prod" ]; then
    git checkout staging || { echo "Failed to checkout branch 'main'" >> $LOG_FILE; exit 1; }
elif [ "$hostname" == "dev" ]; then
    git checkout staging || { echo "Failed to checkout branch 'staging'" >> $LOG_FILE; exit 1; }
else
    echo "Unknown hostname: $hostname. Exiting." >> $LOG_FILE
    exit 1
fi

# Copy environment file
if [ -f $ENV_FILE ]; then
    echo "Copying environment file..." >> $LOG_FILE
    cp $ENV_FILE .env.local || { echo "Failed to copy environment file" >> $LOG_FILE; exit 1; }
else
    echo "Environment file $ENV_FILE does not exist. Exiting." >> $LOG_FILE
    exit 1
fi

# Install dependencies
echo "Installing dependencies..." >> $LOG_FILE
npm install || { echo "Failed to install dependencies" >> $LOG_FILE; exit 1; }

# Building Packages
echo "Building Packages..." >> $LOG_FILE
npm run build || { echo "Failed to build package" >> $LOG_FILE; exit 1; }


# Restart the application using PM2
echo "Restarting application with PM2..." >> $LOG_FILE
pm2 start omni-mongo --time || { echo "Failed to restart application with PM2" >> $LOG_FILE; exit 1; }

# Deactivate virtual environment
echo "Deactivating virtual environment..." >> $LOG_FILE
deactivate || { echo "Failed to deactivate virtual environment" >> $LOG_FILE; exit 1; }

echo "Deployment completed successfully at $(date)" >> $LOG_FILE