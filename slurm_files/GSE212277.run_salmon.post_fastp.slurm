#!/bin/bash

#SBATCH -n 1
#SBATCH -t 12:00:00
#SBATCH -o GSE212277.run_salmon.post_fastp.out
#SBATCH -e GSE212277.run_salmon.post_fastp.err
#SBATCH -p standard
#SBATCH -A harrislab
#SBATCH --mem=20GB
#SBATCH --cpus-per-task=1

module load gcc
module load salmon

module load gcc/11.4.0
module load openmpi/4.1.4
module load R/4.5.0

Rscript src/pre_processing/GSE212277.run_salmon.post_fastp.R
