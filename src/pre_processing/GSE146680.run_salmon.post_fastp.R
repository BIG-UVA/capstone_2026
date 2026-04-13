# parameters
read_dir <- "/standard/harrislab/capstone_2026/raw_reads/GSE146680/"
salmon_index <- "/standard/harrislab/capstone_2026/reference/mm_GRCm39_index/"
quant_root_dir <- "/standard/harrislab/capstone_2026/quants/GSE146680/"

fastq1_end <- "_r1.fp_out.fq.gz"
fastq2_end <- "_r2.fp_out.fq.gz"

# get the fastq files
fastq1_files <- list.files(read_dir,
                           fastq1_end, full.names=T, recursive = T)

fastq2_files <- list.files(read_dir,
                           fastq2_end, full.names=T, recursive = T)

# output directories
quant_dirs <- paste0(quant_root_dir, gsub(fastq1_end, "", basename(fastq1_files)), "_quant/")

# run the salmon command
for (i in 1:length(quant_dirs)) {
  
  command <- paste0("salmon quant",
                    " -i ", salmon_index,
                    " -l A",
                    " -1 ", fastq1_files[i],
                    " -2 ", fastq2_files[i],
                    " -p 8 --validateMappings",
                    " -o ", quant_dirs[i])
  
  print(command)
  system(command)
}


