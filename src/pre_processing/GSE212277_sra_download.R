library(openxlsx)

# this workflow requires access to the SRA toolkit https://github.com/ncbi/sra-tools/wiki

# directory to put the reads in
read_dir <- "/Users/mjl3p/capstone_2026/GSE212277/raw_reads/" 

# output from here https://www.ncbi.nlm.nih.gov/Traces/study/?acc=PRJNA874744&o=acc_s%3Aa
sra_file <- "/Users/mjl3p/capstone_2026/GSE212277/sra_accession.xlsx"

# read in SRA data
sra_data <- read.xlsx(sra_file)

# move to output directory
setwd(read_dir)

# loop through IDs

for (sra_id in sra_data$Run) {
  
  
  # first check if the directory is there
  if (dir.exists(sra_id)) {
    print(paste0(sra_id, " already downloaded; skipping"))
    next
  }
  
  # first prefetch
  command <- paste0("prefetch ", sra_id)
  
  print(command)
  system(command)
  
  # then fasterqdump
  command <- paste0("fasterq-dump ", sra_id)
  
  print(command)
  system(command)
  
  # gzip the fastqfiles
  fastq1_file <- paste0(sra_id, "_1.fastq")
  fastq2_file <- paste0(sra_id, "_2.fastq")
  
  # fastq1
  command <- paste0("gzip ", fastq1_file)
  
  print(command)
  system(command)
  
  # fastq2
  command <- paste0("gzip ", fastq2_file)
  
  print(command)
  system(command)
  
  
}
