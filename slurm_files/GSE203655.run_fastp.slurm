#!/bin/bash

#SBATCH -n 1
#SBATCH -t 12:00:00
#SBATCH -o GSE203655.run_fastp.out
#SBATCH -e GSE203655.run_fastp.err
#SBATCH -p standard
#SBATCH -A harrislab
#SBATCH --mem=20GB
#SBATCH --cpus-per-task=1

module load gcc/11.4.0
module load openmpi/4.1.4
module load R/4.5.0

Rscript src/GSE203655.run_fastp.R